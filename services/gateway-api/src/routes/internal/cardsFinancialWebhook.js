'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const cardsDb = require('../../infrastructure/cardsDb');
const webhookRepo = require('../../repos/cards/cardsWebhookEventsRepo');

const router = express.Router();

function cleanString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeAmount(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return NaN;
  return n;
}

function normalizePayload(body) {
  const provider = cleanString(body.provider) || 'processor';
  const providerEventId =
    cleanString(body.providerEventId) ||
    cleanString(body.provider_event_id) ||
    cleanString(body.eventId) ||
    cleanString(body.event_id);

  const providerAuthId =
    cleanString(body.providerAuthId) ||
    cleanString(body.provider_auth_id);

  const providerCaptureId =
    cleanString(body.providerCaptureId) ||
    cleanString(body.provider_capture_id) ||
    cleanString(body.data?.providerCaptureId) ||
    cleanString(body.data?.provider_capture_id);

  const providerReversalId =
    cleanString(body.providerReversalId) ||
    cleanString(body.provider_reversal_id) ||
    cleanString(body.data?.providerReversalId) ||
    cleanString(body.data?.provider_reversal_id);

  const authorizationId =
    cleanString(body.authorizationId) ||
    cleanString(body.authorization_id) ||
    cleanString(body.data?.authorizationId) ||
    cleanString(body.data?.authorization_id);

  const normalizedType = cleanString(
    body.type || body.eventType || body.event_type
  )?.toLowerCase();

  const eventTypeMap = {
    capture: 'card.capture.received',
    reversal: 'card.reversal.received',
    'card.capture.received': 'card.capture.received',
    'card.reversal.received': 'card.reversal.received'
  };

  const eventType = eventTypeMap[normalizedType] || normalizedType;

  const amount =
    normalizeAmount(body.amount) ??
    normalizeAmount(body.data?.amount);

  const currency =
    cleanString(body.currency)?.toUpperCase() ||
    cleanString(body.data?.currency)?.toUpperCase() ||
    'USD';

  const occurredAt =
    cleanString(body.occurredAt || body.occurred_at) ||
    cleanString(body.data?.occurredAt || body.data?.occurred_at) ||
    null;

  const orderingKey =
    providerCaptureId ||
    providerReversalId ||
    providerAuthId ||
    authorizationId ||
    null;

  const aggregateId =
    authorizationId ||
    providerAuthId ||
    providerCaptureId ||
    providerReversalId ||
    null;

  return {
    provider,
    providerEventId,
    providerAuthId,
    providerCaptureId,
    providerReversalId,
    authorizationId,
    eventType,
    amount,
    currency,
    occurredAt,
    orderingKey,
    aggregateId,
    rawPayload: body || {}
  };
}

function validateNormalizedPayload(payload) {
  if (!payload.providerEventId) {
    return 'provider_event_id_required';
  }

  if (!payload.eventType) {
    return 'event_type_required';
  }

  if (
    payload.eventType !== 'card.capture.received' &&
    payload.eventType !== 'card.reversal.received'
  ) {
    return 'unsupported_event_type';
  }

  if (Number.isNaN(payload.amount)) {
    return 'amount_invalid';
  }

  return null;
}

router.post('/webhooks/financial', async (req, res, next) => {
  const payload = normalizePayload(req.body);
  const validationError = validateNormalizedPayload(payload);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const cardsClient = await cardsDb.connect();

  try {
    await cardsClient.query('BEGIN');

    const storedEvent = await webhookRepo.storeIncomingEvent(cardsClient, {
      provider: payload.provider,
      providerEventId: payload.providerEventId,
      eventType: payload.eventType,
      payload: payload.rawPayload,
      correlationId: req.header('X-Correlation-Id') || null,
      idempotencyKey: req.header('Idempotency-Key') || null
    });

    const inboxId = randomUUID();

    await cardsClient.query(
      `
      insert into public.card_event_inbox (
        id,
        provider,
        provider_event_id,
        event_type,
        ordering_key,
        aggregate_id,
        payload,
        occurred_at,
        received_at,
        process_status,
        process_attempts
      ) values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        $8,
        now(),
        'pending',
        0
      )
      on conflict (provider, provider_event_id)
      do nothing
      `,
      [
        inboxId,
        payload.provider,
        payload.providerEventId,
        payload.eventType,
        payload.orderingKey,
        payload.aggregateId,
        JSON.stringify({
          provider: payload.provider,
          provider_event_id: payload.providerEventId,
          provider_auth_id: payload.providerAuthId,
          provider_capture_id: payload.providerCaptureId,
          provider_reversal_id: payload.providerReversalId,
          authorization_id: payload.authorizationId,
          event_type: payload.eventType,
          amount: payload.amount,
          currency: payload.currency,
          occurred_at: payload.occurredAt,
          raw: payload.rawPayload
        }),
        payload.occurredAt
      ]
    );

    await cardsClient.query('COMMIT');

    return res.status(202).json({
      ok: true,
      accepted: true,
      duplicated: !storedEvent.inserted,
      providerEventId: payload.providerEventId,
      eventType: payload.eventType
    });
  } catch (error) {
    try {
      await cardsClient.query('ROLLBACK');
    } catch (_) {}
    return next(error);
  } finally {
    cardsClient.release();
  }
});

module.exports = router;