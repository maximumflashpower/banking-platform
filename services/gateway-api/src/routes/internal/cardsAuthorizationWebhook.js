'use strict';

const express = require('express');
const cardsDb = require('../../infrastructure/cardsDb');
const financialDb = require('../../infrastructure/financialDb');
const {
  decideAuthorization,
} = require('../../services/cards/authorizations/authorizationDecisionService');

const router = express.Router();

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function normalizeCurrency(value) {
  const currency = cleanString(value);
  return currency ? currency.toUpperCase() : null;
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === '') return null;
  const amount = Number(value);

  if (!Number.isInteger(amount) || amount < 0) {
    return NaN;
  }

  return amount;
}

function buildPayload(req) {
  return {
    provider: cleanString(req.body.provider) || 'processor',
    providerEventId:
      cleanString(req.body.providerEventId) ||
      cleanString(req.body.provider_event_id),
    providerAuthId:
      cleanString(req.body.providerAuthId) ||
      cleanString(req.body.provider_auth_id),
    idempotencyKey:
      cleanString(req.body.idempotencyKey) ||
      cleanString(req.body.idempotency_key) ||
      cleanString(req.header('Idempotency-Key')),
    cardId:
      cleanString(req.body.cardId) ||
      cleanString(req.body.card_id),
    spaceId:
      cleanString(req.body.spaceId) ||
      cleanString(req.body.space_id) ||
      cleanString(req.body.space_uuid),
    amount: normalizeAmount(req.body.amount),
    currency: normalizeCurrency(req.body.currency),
    merchantName:
      cleanString(req.body.merchantName) ||
      cleanString(req.body.merchant_name),
    merchantMcc:
      cleanString(req.body.merchantMcc) ||
      cleanString(req.body.merchant_mcc),
    rawPayload: req.body || {},
  };
}

function validatePayload(payload) {
  const errors = [];

  if (!payload.provider) {
    errors.push('provider_required');
  }

  if (!payload.providerEventId && !payload.idempotencyKey) {
    errors.push('provider_event_id_or_idempotency_key_required');
  }

  if (!payload.providerAuthId) {
    errors.push('provider_auth_id_required');
  }

  if (!payload.cardId) {
    errors.push('card_id_required');
  }

  if (!payload.spaceId) {
    errors.push('space_id_required');
  }

  if (payload.amount === null) {
    errors.push('amount_required');
  } else if (Number.isNaN(payload.amount)) {
    errors.push('amount_invalid');
  }

  if (!payload.currency) {
    errors.push('currency_required');
  } else if (!/^[A-Z]{3}$/.test(payload.currency)) {
    errors.push('currency_invalid');
  }

  return errors;
}

router.post('/webhooks/authorization', async (req, res, next) => {
  try {
    const payload = buildPayload(req);
    const errors = validatePayload(payload);

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'invalid_request',
        details: errors,
      });
    }

    const result = await decideAuthorization({
      cardsDb,
      financialDb,
      payload,
    });

    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;