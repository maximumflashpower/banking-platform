'use strict';

const express = require('express');
const cardsDb = require('../../infrastructure/cardsDb');
const authRepo = require('../../repos/cards/cardAuthorizationsRepo');
const webhookRepo = require('../../repos/cards/cardsWebhookEventsRepo');
const financialFlowsRepo = require('../../repos/cards/cardFinancialFlowsRepo');
const ledgerHoldsClientRepo = require('../../repos/cards/ledgerHoldsClientRepo');
const ledgerPostingsClientRepo = require('../../repos/cards/ledgerPostingsClientRepo');

const router = express.Router();

const CARDHOLDER_ACCOUNT_ID = '09e81c15-2b3c-48e4-846a-4a56c0d7983a';
const SETTLEMENT_ACCOUNT_ID = '775fd388-ed9c-4cd9-a0fa-a660c587a727';

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
  return {
    provider: cleanString(body.provider) || 'processor',
    providerEventId: cleanString(body.providerEventId) || cleanString(body.provider_event_id),
    providerAuthId: cleanString(body.providerAuthId) || cleanString(body.provider_auth_id),
    type: cleanString(body.type || body.eventType || body.event_type)?.toLowerCase(),
    amount: normalizeAmount(body.amount),
    currency: cleanString(body.currency)?.toUpperCase() || 'USD',
    occurredAt: cleanString(body.occurredAt || body.occurred_at),
    rawPayload: body || {},
  };
}

router.post('/webhooks/financial', async (req, res, next) => {
  const payload = normalizePayload(req.body);

  if (!payload.providerEventId) {
    return res.status(400).json({ error: 'provider_event_id_required' });
  }

  if (!payload.providerAuthId) {
    return res.status(400).json({ error: 'provider_auth_id_required' });
  }

  if (!['capture', 'reversal'].includes(payload.type)) {
    return res.status(400).json({ error: 'unsupported_event_type' });
  }

  if (Number.isNaN(payload.amount)) {
    return res.status(400).json({ error: 'amount_invalid' });
  }

  const cardsClient = await cardsDb.connect();

  try {
    await cardsClient.query('BEGIN');

    const storedEvent = await webhookRepo.storeIncomingEvent(cardsClient, {
      provider: payload.provider,
      providerEventId: payload.providerEventId,
      eventType: payload.type,
      payload: payload.rawPayload,
      correlationId: req.header('X-Correlation-Id') || null,
      idempotencyKey: req.header('Idempotency-Key') || null,
    });

    if (!storedEvent.inserted) {
      await cardsClient.query('COMMIT');
      return res.status(200).json({
        ok: true,
        duplicated: true,
        providerEventId: payload.providerEventId,
      });
    }

    const authorization = await authRepo.findByProviderAuthId(
      cardsClient,
      payload.provider,
      payload.providerAuthId
    );

    if (!authorization) {
      await cardsClient.query('COMMIT');
      return res.status(202).json({
        ok: true,
        deferred: true,
        reason: 'authorization_not_found_yet',
        providerAuthId: payload.providerAuthId,
      });
    }

    const amount = payload.amount ?? Number(authorization.amount);
    const currency = payload.currency || authorization.currency;

    if (payload.type === 'capture') {
      const existingCapture = await financialFlowsRepo.findCaptureByAuthorizationId(
        cardsClient,
        authorization.id
      );

      if (existingCapture) {
        await cardsClient.query('COMMIT');
        return res.status(200).json({
          ok: true,
          duplicated: true,
          authorizationId: authorization.id,
          flow: 'capture',
        });
      }

      const existingReversal = await financialFlowsRepo.findReversalByAuthorizationId(
        cardsClient,
        authorization.id
      );

      if (existingReversal) {
        await cardsClient.query('COMMIT');
        return res.status(409).json({
          error: 'capture_not_allowed_after_reversal_in_first_cut',
          authorizationId: authorization.id,
        });
      }

      await cardsClient.query('COMMIT');

      let holdRelease = null;
      if (authorization.ledgerHoldRef) {
        holdRelease = await ledgerHoldsClientRepo.releaseHold({
          holdRef: authorization.ledgerHoldRef,
          reason: 'card_capture_total',
        });
      }

      const settlementIdemKey = `card-capture:${authorization.id}:${payload.providerEventId}`;

      const postings = [
        {
          account_id: CARDHOLDER_ACCOUNT_ID,
          direction: 'CREDIT',
          amount_minor: amount,
          currency,
        },
        {
          account_id: SETTLEMENT_ACCOUNT_ID,
          direction: 'DEBIT',
          amount_minor: amount,
          currency,
        },
      ];

      const ledgerResult = await ledgerPostingsClientRepo.commitCardSettlement({
        spaceId: authorization.spaceId,
        idemKey: settlementIdemKey,
        memo: `card capture total ${authorization.id}`,
        effectiveAt: payload.occurredAt,
        postings,
      });

      await cardsClient.query('BEGIN');

      const captureAgain = await financialFlowsRepo.findCaptureByAuthorizationId(
        cardsClient,
        authorization.id
      );

      if (captureAgain) {
        await cardsClient.query('COMMIT');
        return res.status(200).json({
          ok: true,
          duplicated: true,
          authorizationId: authorization.id,
          flow: 'capture',
        });
      }

      const capture = await financialFlowsRepo.insertCapture(cardsClient, {
        authorizationId: authorization.id,
        provider: payload.provider,
        providerEventId: payload.providerEventId,
        providerAuthId: payload.providerAuthId,
        amount,
        currency,
        ledgerJournalEntryId: ledgerResult.journal_entry_id,
        rawPayload: payload.rawPayload,
        capturedAt: payload.occurredAt,
      });

      await financialFlowsRepo.insertSettlement(cardsClient, {
        authorizationId: authorization.id,
        captureId: capture.id,
        provider: payload.provider,
        providerEventId: `${payload.providerEventId}:settlement`,
        providerAuthId: payload.providerAuthId,
        amount,
        currency,
        rawPayload: payload.rawPayload,
        settledAt: payload.occurredAt,
      });

      await authRepo.markCaptured(cardsClient, {
        authorizationId: authorization.id,
      });

      await cardsClient.query('COMMIT');

      return res.status(200).json({
        ok: true,
        flow: 'capture',
        authorizationId: authorization.id,
        captureId: capture.id,
        holdRelease,
        ledgerResult,
      });
    }

    if (payload.type === 'reversal') {
      const existingReversal = await financialFlowsRepo.findReversalByAuthorizationId(
        cardsClient,
        authorization.id
      );

      if (existingReversal) {
        await cardsClient.query('COMMIT');
        return res.status(200).json({
          ok: true,
          duplicated: true,
          authorizationId: authorization.id,
          flow: 'reversal',
        });
      }

      const existingCapture = await financialFlowsRepo.findCaptureByAuthorizationId(
        cardsClient,
        authorization.id
      );

      if (existingCapture) {
        await cardsClient.query('COMMIT');
        return res.status(409).json({
          error: 'reversal_not_allowed_after_capture_in_first_cut',
          authorizationId: authorization.id,
        });
      }

      await cardsClient.query('COMMIT');

      let holdRelease = null;
      if (authorization.ledgerHoldRef) {
        holdRelease = await ledgerHoldsClientRepo.releaseHold({
          holdRef: authorization.ledgerHoldRef,
          reason: 'card_auth_reversal',
        });
      }

      await cardsClient.query('BEGIN');

      const reversalAgain = await financialFlowsRepo.findReversalByAuthorizationId(
        cardsClient,
        authorization.id
      );

      if (reversalAgain) {
        await cardsClient.query('COMMIT');
        return res.status(200).json({
          ok: true,
          duplicated: true,
          authorizationId: authorization.id,
          flow: 'reversal',
        });
      }

      const reversal = await financialFlowsRepo.insertReversal(cardsClient, {
        authorizationId: authorization.id,
        provider: payload.provider,
        providerEventId: payload.providerEventId,
        providerAuthId: payload.providerAuthId,
        amount,
        currency,
        rawPayload: payload.rawPayload,
        reversedAt: payload.occurredAt,
      });

      await authRepo.markReversed(cardsClient, {
        authorizationId: authorization.id,
      });

      await cardsClient.query('COMMIT');

      return res.status(200).json({
        ok: true,
        flow: 'reversal',
        authorizationId: authorization.id,
        reversalId: reversal.id,
        holdRelease,
      });
    }

    await cardsClient.query('ROLLBACK');
    return res.status(400).json({ error: 'unsupported_event_type' });
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