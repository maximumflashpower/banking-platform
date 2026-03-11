'use strict';

const reversalRepo = require('./cardReversalRepo');

async function reconcilePendingReversals(client, {
  provider,
  capture
}) {
  const pending = await reversalRepo.findPendingReversalsForCapture(client, {
    providerCaptureId: capture.provider_capture_id,
    authorizationId: capture.authorization_id,
    amount: capture.amount,
    currency: capture.currency
  });

  const linked = [];

  for (const orphan of pending) {
    const existing = await reversalRepo.findByProviderReversalId(client, {
      providerReversalId: orphan.provider_reversal_id
    });

    if (!existing) {
      const created = await reversalRepo.createReversal(client, {
        authorizationId: orphan.authorization_id || capture.authorization_id,
        providerReversalId: orphan.provider_reversal_id,
        captureId: capture.id,
        amount: orphan.amount,
        currency: orphan.currency,
        payload: orphan.payload
      });

      linked.push(created);
    }

    await reversalRepo.markPendingReversalResolved(client, {
      pendingReversalId: orphan.id,
      linkedCaptureId: capture.id
    });
  }

  return linked;
}

module.exports = {
  reconcilePendingReversals
};
