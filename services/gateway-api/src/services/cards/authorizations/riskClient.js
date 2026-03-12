'use strict';

const DEFAULT_TIMEOUT_MS = 150;

function withTimeout(promiseFactory, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`risk_timeout_after_${timeoutMs}ms`);
      error.code = 'RISK_TIMEOUT';
      reject(error);
    }, timeoutMs);

    Promise.resolve()
      .then(promiseFactory)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
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

async function callRiskEndpoint(input, timeoutMs) {
  const response = await withTimeout(
    async () =>
      fetch('http://localhost:3000/internal/v1/risk/decision/evaluate', {
        method: 'POST',
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
        }),
      }),
    timeoutMs
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`risk_http_${response.status}:${text}`);
  }

  const json = await response.json();
  return normalizeRiskResponse(json.data || json);
}

async function evaluateRisk(input) {
  try {
    return await callRiskEndpoint(input, DEFAULT_TIMEOUT_MS);
  } catch (error) {
    return {
      decision: 'allow_with_monitoring',
      score: 0,
      reason:
        error && error.code === 'RISK_TIMEOUT'
          ? 'risk_timeout_fallback'
          : 'risk_error_fallback',
    };
  }
}

module.exports = {
  evaluateRisk,
  DEFAULT_TIMEOUT_MS,
};