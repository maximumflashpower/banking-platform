'use strict';

const captureRepo = require('./cardCaptureRepo');
const { reconcilePendingReversals } = require('./reconcilePendingReversals');

function isDuplicateCaptureError(error) {
  return (
    error &&
    error.code === '23505' &&
    typeof error.message === 'string' &&
    (
      error.message.includes('card_captures_authorization_id_key') ||
      error.message.includes('uq_card_captures_provider_capture_id')
    )
  );
}

async function processCaptureReceived(client, event) {
  const payload = event.payload || {};
  const providerCaptureId =
    payload.provider_capture_id ||
    payload.raw?.data?.provider_capture_id ||
    null;

  const authorizationId =
    payload.authorization_id ||
    payload.raw?.data?.authorization_id ||
    null;

  const amount = payload.amount ?? payload.raw?.data?.amount ?? null;
  const currency = payload.currency || payload.raw?.data?.currency || 'USD';

  if (!providerCaptureId) {
    return {
      status: 'failed_terminal',
      reason: 'provider_capture_id_required'
    };
  }

  const existing = await captureRepo.findByProviderCaptureId(client, {
    providerCaptureId
  });

  if (existing) {
    return {
      status: 'duplicate',
      duplicateOf: existing.id
    };
  }

  try {
    const created = await captureRepo.createCapture(client, {
      authorizationId,
      provider: event.provider,
      providerEventId: event.provider_event_id,
      providerAuthId: payload.provider_auth_id || null,
      providerCaptureId,
      amount,
      currency,
      payload
    });

    const linkedReversals = await reconcilePendingReversals(client, {
      provider: event.provider,
      capture: created
    });

    return {
      status: 'processed',
      capture: created,
      linkedReversals
    };
  } catch (error) {
    if (isDuplicateCaptureError(error)) {
      return {
        status: 'duplicate',
        duplicateOf: authorizationId || providerCaptureId
      };
    }

    throw error;
  }
}

module.exports = {
  processCaptureReceived
};