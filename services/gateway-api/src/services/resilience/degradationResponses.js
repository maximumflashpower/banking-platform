'use strict';

function buildRailDisabledResponse({ rail, message, requestId }) {
  return {
    ok: false,
    error: 'rail_disabled',
    code: 'rail_disabled',
    rail,
    retryable: true,
    message,
    request_id: requestId || null,
  };
}

function buildCardsRailDecline({ requestId }) {
  return {
    authorizationId: null,
    cardId: null,
    spaceId: null,
    provider: 'internal',
    providerAuthId: null,
    idempotencyKey: null,
    status: 'degraded',
    decision: 'decline',
    declineReason: 'RAIL_DISABLED',
    riskStatus: 'not_requested',
    availableBalanceSnapshot: null,
    ledgerHoldId: null,
    ledgerHoldRef: null,
    holdStatus: null,
    amount: null,
    currency: null,
    merchantName: null,
    merchantMcc: null,
    idempotentReplay: false,
    webhookReplay: false,
    createdAt: null,
    decisionedAt: new Date().toISOString(),
    degraded: true,
    retryable: true,
    requestId: requestId || null,
  };
}

module.exports = {
  buildRailDisabledResponse,
  buildCardsRailDecline,
};