'use strict';

function buildMockTransferId() {
  return `ach_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function submitAchTransfer({ paymentIntent, transfer }) {
  return {
    provider: 'mock_ach',
    provider_transfer_id: buildMockTransferId(),
    state: 'submitted',
    metadata: {
      rail: 'ach',
      mocked: true,
      payment_intent_id: paymentIntent.id,
      transfer_id: transfer.id,
    },
  };
}

module.exports = {
  submitAchTransfer,
};