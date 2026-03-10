'use strict';

async function createHold(payload) {
  const baseUrl = process.env.LEDGER_INTERNAL_BASE_URL || 'http://ledger:3000';

  const response = await fetch(`${baseUrl}/internal/v1/ledger/holds/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      spaceId: payload.spaceId,
      holdRef: payload.holdRef,
      amount: payload.amount,
      currency: payload.currency,
      reason: 'card_authorization',
      metadata: {
        authorizationId: payload.authorizationId,
        provider: payload.provider,
        providerAuthId: payload.providerAuthId || null,
        cardId: payload.cardId,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`ledger_hold_create_failed:${JSON.stringify(data)}`);
  }

  return data;
}

async function releaseHold(payload) {
  const baseUrl = process.env.LEDGER_INTERNAL_BASE_URL || 'http://ledger:3000';

  const response = await fetch(`${baseUrl}/internal/v1/ledger/holds/release`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      holdRef: payload.holdRef,
      reason: payload.reason || 'manual_release',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`ledger_hold_release_failed:${JSON.stringify(data)}`);
  }

  return data;
}

module.exports = {
  createHold,
  releaseHold,
};