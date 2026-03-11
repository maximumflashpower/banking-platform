'use strict';

const captureRepo = require('./cardCaptureRepo');
const reversalRepo = require('./cardReversalRepo');

async function processReversalReceived(client, event) {
  const payload = event.payload || {};
  const providerReversalId = payload.provider_reversal_id || payload.raw?.data?.provider_reversal_id || null;
  const providerCaptureId = payload.provider_capture_id || payload.raw?.data?.provider_capture_id || null;
  const authorizationId = payload.authorization_id || payload.raw?.data?.authorization_id || null;
  const amount = payload.amount ?? payload.raw?.data?.amount ?? null;
  const currency = payload.currency || payload.raw?.data?.currency || 'USD';

  if (!providerReversalId) {
    return {
      status: 'failed_terminal',
      reason: 'provider_reversal_id_required'
    };
  }

  const existing = await reversalRepo.findByProviderReversalId(client, {
    providerReversalId
  });

  if (existing) {
    return {
      status: 'duplicate',
      duplicateOf: existing.id
    };
  }

  const capture = providerCaptureId
    ? await captureRepo.findByProviderCaptureId(client, { providerCaptureId })
    : null;

  if (!capture) {
    const orphan = await reversalRepo.createPendingReversal(client, {
      provider: event.provider,
      providerReversalId,
      authorizationId,
      providerCaptureId,
      amount,
      currency,
      payload
    });

    return {
      status: 'deferred',
      pendingReversal: orphan
    };
  }

  const created = await reversalRepo.createReversal(client, {
    authorizationId: authorizationId || capture.authorization_id,
    providerReversalId,
    captureId: capture.id,
    amount,
    currency,
    payload
  });

  return {
    status: 'processed',
    reversal: created
  };
}

module.exports = {
  processReversalReceived
};
