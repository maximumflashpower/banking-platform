'use strict';

const express = require('express');
const cardsRepo = require('../../repos/cards/cardsRepo');
const cardsAuthorizationWebhookRouter = require('./cardsAuthorizationWebhook');
const cardsAuthDecisionRouter = require('./cardsAuthDecision');

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildCorrelationId(req) {
  return req.headers['x-correlation-id'] || null;
}

function handleError(res, err) {
  if (err && err.code === 'CARDS_DB_UNAVAILABLE') {
    return res.status(503).json({
      error: 'cards_domain_unavailable',
      message: 'cards domain is temporarily unavailable',
    });
  }

  if (err && err.code === 'CARD_STATUS_INVALID') {
    return res.status(err.httpStatus || 409).json({
      error: 'invalid_card_state_transition',
      message: err.message,
    });
  }

  console.error('[cards route error]', err);

  return res.status(500).json({
    error: 'internal_error',
    message: 'unexpected error',
  });
}

router.post('/', async (req, res) => {
  try {
    const {
      card_token,
      business_id,
      user_id,
      space_uuid,
      program_id,
      brand,
      network,
      last4,
      exp_month,
      exp_year,
      cardholder_name,
      metadata,
      pan,
      cvv,
      status,
      freeze_reason,
    } = req.body || {};

    if (!card_token || typeof card_token !== 'string') {
      return res.status(400).json({
        error: 'validation_error',
        message: 'card_token is required',
      });
    }

    if (!last4 || !/^[0-9]{4}$/.test(String(last4))) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'last4 must be exactly 4 digits',
      });
    }

    if (space_uuid && !isUuid(space_uuid)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'space_uuid must be a valid uuid',
      });
    }

    if (exp_month !== undefined && (!Number.isInteger(exp_month) || exp_month < 1 || exp_month > 12)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'exp_month must be an integer between 1 and 12',
      });
    }

    if (exp_year !== undefined && (!Number.isInteger(exp_year) || exp_year < 2000)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'exp_year must be a valid integer >= 2000',
      });
    }

    if (metadata !== undefined && !isObject(metadata)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'metadata must be an object',
      });
    }

    if (pan !== undefined || cvv !== undefined) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'PAN and CVV must not be sent to this endpoint',
      });
    }

    if (status !== undefined || freeze_reason !== undefined) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'status and freeze_reason are not accepted on card creation',
      });
    }

    const card = await cardsRepo.createCard(
      {
        card_token,
        business_id,
        user_id,
        space_uuid,
        program_id,
        brand,
        network,
        last4,
        exp_month,
        exp_year,
        cardholder_name,
        metadata,
      },
      {
        idempotencyKey: req.headers['idempotency-key'] || null,
        correlationId: buildCorrelationId(req),
      }
    );

    return res.status(201).json(card);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    const items = await cardsRepo.listRecent(limit);

    return res.status(200).json({
      items,
      limit: Math.max(1, Math.min(Number(limit) || 20, 100)),
    });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'id must be a valid uuid',
      });
    }

    const card = await cardsRepo.findById(id);

    if (!card) {
      return res.status(404).json({
        error: 'not_found',
        message: 'card not found',
      });
    }

    return res.status(200).json(card);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/:id/freeze', async (req, res) => {
  try {
    const { id } = req.params;
    const { freeze_reason } = req.body || {};

    if (!isUuid(id)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'id must be a valid uuid',
      });
    }

    if (!freeze_reason || typeof freeze_reason !== 'string') {
      return res.status(400).json({
        error: 'validation_error',
        message: 'freeze_reason is required',
      });
    }

    const card = await cardsRepo.freezeCard(id, freeze_reason, {
      idempotencyKey: req.headers['idempotency-key'] || null,
      correlationId: buildCorrelationId(req),
    });

    if (!card) {
      return res.status(404).json({
        error: 'not_found',
        message: 'card not found',
      });
    }

    return res.status(200).json(card);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/:id/unfreeze', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'id must be a valid uuid',
      });
    }

    const card = await cardsRepo.unfreezeCard(id, {
      idempotencyKey: req.headers['idempotency-key'] || null,
      correlationId: buildCorrelationId(req),
    });

    if (!card) {
      return res.status(404).json({
        error: 'not_found',
        message: 'card not found',
      });
    }

    return res.status(200).json(card);
  } catch (err) {
    return handleError(res, err);
  }
});

// Stage 5B additive routes
router.use('/', cardsAuthorizationWebhookRouter);
router.use('/', cardsAuthDecisionRouter);

module.exports = router;