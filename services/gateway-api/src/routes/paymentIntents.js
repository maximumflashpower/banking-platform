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

function envInt(name, fallback) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;

  return Math.trunc(n);
}

function envStr(name, fallback) {
  const raw = process.env[name];
  return (typeof raw === 'string' && raw.trim()) ? raw.trim() : fallback;
}

function approvalPolicyForSpace(_spaceId) {
  const thresholdAmountCents = Math.max(0, envInt('PAYMENT_APPROVAL_THRESHOLD_CENTS', 100000));
  const requiredApprovals = Math.max(1, envInt('PAYMENT_APPROVAL_REQUIRED_APPROVALS', 2));
  const rejectionMode = envStr('PAYMENT_APPROVAL_REJECTION_MODE', 'any') === 'majority'
    ? 'majority'
    : 'any';

  const eligibleVotersCount = Math.max(
    requiredApprovals,
    envInt('PAYMENT_APPROVAL_ELIGIBLE_VOTERS', requiredApprovals)
  );

  return {
    policy_version: 'v1',
    threshold_amount_cents: thresholdAmountCents,
    required_approvals: requiredApprovals,
    eligible_voters_count: eligibleVotersCount,
    rejection_mode: rejectionMode,
  };
}

async function insertIntentState(client, {
  paymentIntentId,
  state,
  correlationId,
  reasonCode = null,
  reasonDetail = null,
}) {
  await client.query(
    `
    INSERT INTO payment_intent_states (
      id,
      payment_intent_id,
      state,
      reason_code,
      reason_detail,
      correlation_id,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp(), clock_timestamp())
    `,
    [
      crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
      paymentIntentId,
      state,
      reasonCode,
      reasonDetail,
      correlationId,
    ]
  );
}

router.post('/payment-intents', async (req, res, next) => {
  const idemKey = req.header('Idempotency-Key');

  try {
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

    const normalizedCurrency = currency.trim().toUpperCase();
    const correlationId = getCorrelationId(req);

    const requestHash = sha256Hex(
      JSON.stringify({
        payer_user_id,
        payee_user_id,
        amount_cents,
        currency: normalizedCurrency,
      })
    );

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

    const intentId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const policy = approvalPolicyForSpace(spaceId);
    const requiresApproval = amount_cents >= policy.threshold_amount_cents;

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
        normalizedCurrency,
        amount_cents,
        idemKey,
        correlationId,
      ]
    );

    await insertIntentState(db, {
      paymentIntentId: intentId,
      state: 'created',
      correlationId,
    });

    await insertIntentState(db, {
      paymentIntentId: intentId,
      state: 'validated',
      correlationId,
    });

    if (requiresApproval) {
      await db.query(
        `
        INSERT INTO payment_approvals (
          id,
          space_id,
          business_id,
          payment_intent_id,
          status,
          policy_version,
          threshold_amount_cents,
          required_approvals,
          eligible_voters_count,
          rejection_mode,
          created_by_member_id,
          metadata
        )
        VALUES (
          $1,$2,$3,$4,
          'pending',
          $5,$6,$7,$8,$9,$10,$11::jsonb
        )
        ON CONFLICT (payment_intent_id) DO NOTHING
        `,
        [
          crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
          spaceId,
          spaceId, // v1: business_id = space_id
          intentId,
          policy.policy_version,
          policy.threshold_amount_cents,
          policy.required_approvals,
          policy.eligible_voters_count,
          policy.rejection_mode,
          null,
          JSON.stringify({
            correlation_id: correlationId,
            policy_snapshot: policy,
            stage: 'stage3c-payment-approvals',
          }),
        ]
      );

      await insertIntentState(db, {
        paymentIntentId: intentId,
        state: 'pending_approval',
        correlationId,
      });
    }

    const responsePayload = {
      ok: true,
      intent_id: intentId,
      state: requiresApproval ? 'pending_approval' : 'validated',
      correlation_id: correlationId,
      space_id: spaceId,
      approval: requiresApproval
        ? {
            required: true,
            threshold_amount_cents: policy.threshold_amount_cents,
            required_approvals: policy.required_approvals,
            eligible_voters_count: policy.eligible_voters_count,
            rejection_mode: policy.rejection_mode,
            policy_version: policy.policy_version,
          }
        : {
            required: false,
          },
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