'use strict';

const auditService = require('../../audit/auditService');
const { withExternalCall } = require('../../resilience/withExternalCall');
const {
  ExternalPermanentError,
  ExternalTimeoutError,
} = require('../../resilience/errorTypes');

const DEFAULT_TIMEOUT_MS = 150;

function getBaseUrl() {
  return (
    process.env.RISK_INTERNAL_BASE_URL ||
    process.env.GATEWAY_INTERNAL_BASE_URL ||
    'http://127.0.0.1:3000'
  );
}

function buildUrl(pathname) {
  return `${getBaseUrl()}${pathname}`;
}

function normalizeDecision(value) {
  if (value === 'block_tx') return 'block_tx';
  if (value === 'allow_with_monitoring') return 'allow_with_monitoring';
  return 'allow';
}

function normalizeRiskResponse(payload = {}) {
  return {
    decision: normalizeDecision(payload.decision),
    score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : 0,
    reason: payload.reason || 'stage6e_default_allow',
  };
}

async function callRiskEndpoint(input) {
  const timeoutMs = Number(input?.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl('/internal/v1/risk/decision/evaluate'), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        flow: 'card_authorization',
        card_id: input.cardId,
        space_id: input.spaceId,
        provider: input.provider,
        provider_auth_id: input.providerAuthId,
        amount: input.amount,
        currency: input.currency,
        merchant_name: input.merchantName,
        merchant_mcc: input.merchantMcc,
        idempotency_key: input.idempotencyKey,
        test_delay_ms: input.testDelayMs || undefined,
        test_force_error: input.testForceError === true ? true : undefined,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = new Error(`risk_http_${response.status}:${text}`);
      error.status = response.status;

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new ExternalPermanentError(error.message, {
          status: response.status,
        });
      }

      throw error;
    }

    const json = await response.json();
    return normalizeRiskResponse(json.data || json);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ExternalTimeoutError(`risk_timeout_after_${timeoutMs}ms`, {
        timeoutMs,
        operation: 'card_authorization_risk_evaluation',
      });
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function writeFallbackAudit(input, classified) {
  if (typeof auditService.writeSystemAuditEvent !== 'function') {
    return;
  }

  const auditRequestId =
    input.requestId ||
    input.idempotencyKey ||
    `risk-fallback-${Date.now()}`;

  await auditService.writeSystemAuditEvent({
    request_id: auditRequestId,
    correlation_id: input.correlationId || input.idempotencyKey || null,
    actor_space_id: input.spaceId || null,
    event_category: 'risk',
    event_type: 'risk.fallback.safe_default_applied',
    target_type: 'card_authorization',
    target_id: input.providerAuthId || input.cardId || null,
    action: 'evaluate',
    result: 'fallback_applied',
    reason: classified.category === 'timeout' ? 'risk_timeout' : 'risk_failure',
    metadata: {
      operation: 'card_authorization_risk_evaluation',
      fallback: 'safe_default',
      safe_default_decision: 'block_tx',
      retriable: classified.retriable,
      category: classified.category,
      provider: input.provider || null,
      card_id: input.cardId || null,
    },
  });
}

async function evaluateRisk(input) {
  return withExternalCall({
    operation: 'card_authorization_risk_evaluation',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    execute: async () => callRiskEndpoint(input),
    onError: async (_error, classified) => {
      await writeFallbackAudit(input, classified);
    },
    fallback: async (_error, classified) => {
      return {
        decision: 'block_tx',
        score: 100,
        reason:
          classified.category === 'timeout'
            ? 'risk_timeout_safe_default_block'
            : 'risk_error_safe_default_block',
        fallback_applied: true,
        retriable: classified.retriable,
      };
    },
  });
}

module.exports = {
  evaluateRisk,
  DEFAULT_TIMEOUT_MS,
};
