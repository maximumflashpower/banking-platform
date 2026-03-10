'use strict';

function envBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function evaluateRisk(input) {
  const localBypassEnabled =
    envBool(process.env.RISK_BYPASS_FOR_LOCAL) ||
    envBool(process.env.CARDS_RISK_BYPASS_FOR_LOCAL);

  const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();

  if (localBypassEnabled) {
    return {
      ok: true,
      status: 'approved',
      source: 'local_bypass',
      detail: {
        nodeEnv,
        flow: input?.flow || 'unknown',
      },
    };
  }

  const riskUrl =
    process.env.RISK_DECISION_URL ||
    process.env.RISK_INTERNAL_URL ||
    null;

  if (!riskUrl) {
    return {
      ok: false,
      status: 'timeout',
      source: 'risk_unconfigured',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.RISK_TIMEOUT_MS || 1500);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(riskUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(input || {}),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        status: 'timeout',
        source: 'risk_http_error',
        httpStatus: response.status,
      };
    }

    const data = await response.json().catch(() => ({}));
    const decision = String(data?.status || data?.decision || '').toLowerCase();

    if (decision === 'approved' || decision === 'approve') {
      return {
        ok: true,
        status: 'approved',
        source: 'risk_service',
        data,
      };
    }

    if (decision === 'declined' || decision === 'decline') {
      return {
        ok: true,
        status: 'declined',
        source: 'risk_service',
        data,
      };
    }

    return {
      ok: false,
      status: 'timeout',
      source: 'risk_invalid_payload',
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'timeout',
      source: 'risk_exception',
      message: error?.message || 'unknown',
    };
  }
}

module.exports = {
  evaluateRisk,
};