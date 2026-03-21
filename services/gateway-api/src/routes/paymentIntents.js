'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../infrastructure/financialDb');
const paymentIntentRiskGateService = require('../services/payments/paymentIntentRiskGateService');
const paymentIntentRiskGateRepo = require('../repos/payments/paymentIntentRiskGateRepo');
const { requireKycVerified } = require('../middleware/requireKycVerified');

const router = express.Router();

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

function newUuid() {
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
    rejection_mode: rejectionMode
  };
}

async function insertIntentState(client, {
  paymentIntentId,
  state,
  correlationId,
  reasonCode = null,
  reasonDetail = null
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
      newUuid(),
      paymentIntentId,
      state,
      reasonCode,
      reasonDetail,
      correlationId
    ]
  );
}

function withRiskFields(baseResponse, riskGate) {
  return {
    ...baseResponse,
    risk_gate_status: riskGate.risk_gate_status,
    risk_decision_id: riskGate.decision_id,
    risk_reason_code: riskGate.reason_code,
    risk_score: riskGate.risk_score,
    aml_risk_case_id: riskGate.aml_risk_case_id,
    ops_notification_id: riskGate.ops_notification_id
  };
}

async function hydrateRiskFieldsIfNeeded(responseJson) {
  if (!responseJson || !responseJson.intent_id) {
    return responseJson;
  }

  if (responseJson.risk_gate_status) {
    return responseJson;
  }

  const projection = await paymentIntentRiskGateRepo.getPaymentIntentForRisk(responseJson.intent_id);

  if (!projection) {
    return responseJson;
  }

  return {
    ...responseJson,
    risk_gate_status: projection.risk_gate_status,
    risk_decision_id: projection.risk_decision_id,
    risk_reason_code: projection.risk_reason_code,
    risk_score: projection.risk_score,
    aml_risk_case_id: projection.aml_risk_case_id,
    ops_notification_id: projection.ops_notification_id
  };
}

router.post('/', requireKycVerified, async (req, res, next) => {
  const idemKey = req.header('Idempotency-Key');

  if (!isNonEmptyString(idemKey)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Idempotency-Key header is required'
    });
  }

  const spaceId = getSpaceId(req);
  if (!spaceId) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'X-Space-Id header is required (idempotency is per space)'
    });
  }

  const { payer_user_id, payee_user_id, amount_cents, currency } = req.body || {};

  if (!isUuidLike(payer_user_id) || !isUuidLike(payee_user_id)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'payer_user_id and payee_user_id are required (uuid strings)'
    });
  }

  if (!isPositiveInt(amount_cents)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'amount_cents must be a positive integer (minor units, e.g. cents)'
    });
  }

  if (!isNonEmptyString(currency) || currency.trim().length !== 3) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'currency is required (3-letter code)'
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
      risk_context: req.body?.risk_context || {}
    })
  );

  const client = await pool.connect();

  try {
    const existing = await client.query(
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
          message: 'Idempotency-Key was already used with a different request payload'
        });
      }

      const hydrated = await hydrateRiskFieldsIfNeeded(row.response_json);
      return res.status(200).json(hydrated);
    }

    const intentId = newUuid();
    const policy = approvalPolicyForSpace(spaceId);
    const requiresApproval = amount_cents >= policy.threshold_amount_cents;
    const finalState = requiresApproval ? 'pending_approval' : 'queued';

    await client.query('BEGIN');

    await client.query(
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
        correlationId
      ]
    );

    await insertIntentState(client, {
      paymentIntentId: intentId,
      state: 'created',
      correlationId
    });

    await insertIntentState(client, {
      paymentIntentId: intentId,
      state: 'validated',
      correlationId
    });

    if (requiresApproval) {
      await client.query(
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
          newUuid(),
          spaceId,
          spaceId,
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
            stage: 'stage3c-payment-approvals'
          })
        ]
      );

      await insertIntentState(client, {
        paymentIntentId: intentId,
        state: 'pending_approval',
        correlationId
      });
    } else {
      await insertIntentState(client, {
        paymentIntentId: intentId,
        state: 'queued',
        correlationId
      });
    }

    const provisionalResponse = {
      ok: true,
      intent_id: intentId,
      state: finalState,
      correlation_id: correlationId,
      space_id: spaceId,
      approval: requiresApproval
        ? {
            required: true,
            threshold_amount_cents: policy.threshold_amount_cents,
            required_approvals: policy.required_approvals,
            eligible_voters_count: policy.eligible_voters_count,
            rejection_mode: policy.rejection_mode,
            policy_version: policy.policy_version
          }
        : {
            required: false
          }
    };

    await client.query(
      `
        INSERT INTO idempotency_keys (space_id, scope, idem_key, request_hash, response_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [spaceId, IDEM_SCOPE, idemKey, requestHash, JSON.stringify(provisionalResponse)]
    );

    await client.query('COMMIT');

    const riskGate = await paymentIntentRiskGateService.evaluateOnCreate({
      paymentIntentId: intentId,
      payload: {
        space_id: spaceId,
        payer_user_id,
        payee_user_id,
        amount_cents,
        currency: normalizedCurrency,
        risk_context: req.body?.risk_context || {}
      },
      actor: {
        type: 'system',
        id: 'public-payment-intents'
      }
    });

    const finalResponse = withRiskFields(provisionalResponse, riskGate);

    await pool.query(
      `
        UPDATE idempotency_keys
        SET response_json = $4::jsonb
        WHERE space_id = $1
          AND scope = $2
          AND idem_key = $3
      `,
      [spaceId, IDEM_SCOPE, idemKey, JSON.stringify(finalResponse)]
    );

    return res.status(201).json(finalResponse);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    return next(err);
  } finally {
    client.release();
  }
});

module.exports = router;