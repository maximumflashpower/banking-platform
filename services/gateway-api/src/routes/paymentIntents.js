'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../infrastructure/financialDb');

const router = express.Router();

// Este scope debe ser estable (forma parte de la UNIQUE key junto a space_id + scope + idem_key)
const IDEM_SCOPE = 'public.v1.finance.payment-intents.create';

function getSpaceId(req) {
  const spaceId = req.header('X-Space-Id');
  return typeof spaceId === 'string' && spaceId.trim() ? spaceId.trim() : null;
}

function getCorrelationId(req) {
  const h = req.header('X-Correlation-Id');
  if (typeof h === 'string' && h.trim()) return h.trim();
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function isNonEmptyString(x) {
  return typeof x === 'string' && x.trim().length > 0;
}

function isPositiveInt(x) {
  return Number.isInteger(x) && x > 0;
}

function isUuidLike(x) {
  return typeof x === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

router.post('/payment-intents', async (req, res, next) => {
  const idemKey = req.header('Idempotency-Key');

  try {
    // --- Validaciones base ---
    if (!isNonEmptyString(idemKey)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Idempotency-Key header is required',
      });
    }

    const spaceId = getSpaceId(req);
    if (!spaceId) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'X-Space-Id header is required (idempotency is per space)',
      });
    }

    const { payer_user_id, payee_user_id, amount_cents, currency } = req.body || {};

    if (!isUuidLike(payer_user_id) || !isUuidLike(payee_user_id)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'payer_user_id and payee_user_id are required (uuid strings)',
      });
    }

    if (!isPositiveInt(amount_cents)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'amount_cents must be a positive integer (minor units, e.g. cents)',
      });
    }

    if (!isNonEmptyString(currency) || currency.trim().length !== 3) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'currency is required (3-letter code)',
      });
    }

    const correlationId = getCorrelationId(req);

    // --- Idempotencia: request_hash ---
    const requestHash = sha256Hex(
      JSON.stringify({
        payer_user_id,
        payee_user_id,
        amount_cents,
        currency: currency.trim().toUpperCase(),
      })
    );

    // 1) Buscar si ya existe (space_id + scope + idem_key)
    const existing = await db.query(
      `
      SELECT request_hash, response_json
      FROM idempotency_keys
      WHERE space_id = $1 AND scope = $2 AND idem_key = $3
      LIMIT 1
      `,
      [spaceId, IDEM_SCOPE, idemKey]
    );

    if (existing.rowCount > 0) {
      const row = existing.rows[0];

      if (row.request_hash !== requestHash) {
        return res.status(409).json({
          error: 'idempotency_key_conflict',
          message: 'Idempotency-Key was already used with a different request payload',
        });
      }

      return res.status(200).json(row.response_json);
    }

    // 2) Crear intent + state + idempotency record de forma atómica
    const intentId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const stateId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    await db.query('BEGIN');

    await db.query(
      `
      INSERT INTO payment_intents (
        id,
        space_id,
        payer_user_id,
        payee_user_id,
        currency,
        amount_cents,
        idempotency_key,
        correlation_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        intentId,
        spaceId,
        payer_user_id,
        payee_user_id,
        currency.trim().toUpperCase(),
        amount_cents,
        idemKey,
        correlationId,
      ]
    );

    // ✅ FIX: payment_intent_states usa (id, payment_intent_id, ...)
    await db.query(
      `
      INSERT INTO payment_intent_states (id, payment_intent_id, state, correlation_id)
      VALUES ($1, $2, $3, $4)
      `,
      [stateId, intentId, 'created', correlationId]
    );

    const responsePayload = {
      ok: true,
      intent_id: intentId,
      state: 'created',
      correlation_id: correlationId,
      space_id: spaceId,
    };

    await db.query(
      `
      INSERT INTO idempotency_keys (space_id, scope, idem_key, request_hash, response_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (space_id, scope, idem_key) DO NOTHING
      `,
      [spaceId, IDEM_SCOPE, idemKey, requestHash, JSON.stringify(responsePayload)]
    );

    await db.query('COMMIT');

    // Re-lee para cubrir carreras
    const saved = await db.query(
      `
      SELECT request_hash, response_json
      FROM idempotency_keys
      WHERE space_id = $1 AND scope = $2 AND idem_key = $3
      LIMIT 1
      `,
      [spaceId, IDEM_SCOPE, idemKey]
    );

    if (saved.rowCount === 1) {
      if (saved.rows[0].request_hash !== requestHash) {
        return res.status(409).json({
          error: 'idempotency_key_conflict',
          message: 'Idempotency-Key was already used with a different request payload',
        });
      }
      return res.status(201).json(saved.rows[0].response_json);
    }

    return res.status(201).json(responsePayload);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch (_) {}
    return next(err);
  }
});

module.exports = router;