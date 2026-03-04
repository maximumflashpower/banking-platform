'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../infrastructure/financialDb');

const router = express.Router();

// Este scope debe ser estable (forma parte de la UNIQUE key junto a space_id + idem_key)
const IDEM_SCOPE = 'public.v1.finance.payment-intents.create';

// En tu DB idempotency_keys requiere space_id.
// Para ETAPA 2C, lo más práctico es exigirlo vía header. (Más adelante vendrá de Identity/Spaces.)
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

    const { from_account, to_account, amount, currency } = req.body || {};

    if (!isNonEmptyString(from_account) || !isNonEmptyString(to_account)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'from_account and to_account are required (non-empty strings)',
      });
    }

    if (!isPositiveInt(amount)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'amount must be a positive integer (minor units, e.g. cents)',
      });
    }

    if (!isNonEmptyString(currency)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'currency is required',
      });
    }

    const correlationId = getCorrelationId(req);

    // --- Idempotencia: request_hash ---
    // Si reusan la misma key con un body diferente, detectamos conflicto.
    const requestHash = sha256Hex(
      JSON.stringify({
        from_account,
        to_account,
        amount,
        currency,
        // puedes incluir más campos aquí cuando crezca el payload
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

      // misma key pero request diferente => conflicto (esto es estándar)
      if (row.request_hash !== requestHash) {
        return res.status(409).json({
          error: 'idempotency_key_conflict',
          message: 'Idempotency-Key was already used with a different request payload',
        });
      }

      // replay válido => devolvemos exactamente lo guardado
      return res.status(200).json(row.response_json);
    }

    // 2) Crear intent + state + idempotency record de forma atómica
    const intentId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    await db.query('BEGIN');

    await db.query(
      `
      INSERT INTO payment_intents (id, from_account, to_account, amount, currency)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [intentId, from_account.trim(), to_account.trim(), amount, currency.trim().toUpperCase()]
    );

    await db.query(
      `
      INSERT INTO payment_intent_states (intent_id, state, correlation_id)
      VALUES ($1, $2, $3)
      `,
      [intentId, 'created', correlationId]
    );

    const responsePayload = {
      ok: true,
      intent_id: intentId,
      state: 'created',
      correlation_id: correlationId,
      space_id: spaceId,
    };

    // Insert idempotency row (usa el esquema real de tu DB)
    // Si hay carrera (dos requests simultáneos), la UNIQUE constraint puede disparar.
    // Usamos ON CONFLICT DO NOTHING y luego re-leemos.
    await db.query(
      `
      INSERT INTO idempotency_keys (space_id, scope, idem_key, request_hash, response_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (space_id, scope, idem_key) DO NOTHING
      `,
      [spaceId, IDEM_SCOPE, idemKey, requestHash, JSON.stringify(responsePayload)]
    );

    await db.query('COMMIT');

    // Re-lee para asegurar que si hubo carrera devolvemos lo persistido
    const saved = await db.query(
      `
      SELECT request_hash, response_json
      FROM idempotency_keys
      WHERE space_id = $1 AND scope = $2 AND idem_key = $3
      LIMIT 1
      `,
      [spaceId, IDEM_SCOPE, idemKey]
    );

    // Normalmente rowCount = 1
    if (saved.rowCount === 1) {
      // Si por alguna razón el hash difiere, devuelves conflicto
      if (saved.rows[0].request_hash !== requestHash) {
        return res.status(409).json({
          error: 'idempotency_key_conflict',
          message: 'Idempotency-Key was already used with a different request payload',
        });
      }
      return res.status(201).json(saved.rows[0].response_json);
    }

    // Fallback extremo (no debería pasar)
    return res.status(201).json(responsePayload);
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch (_) {}
    return next(err);
  }
});

module.exports = router;
