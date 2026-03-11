'use strict';

const { randomUUID } = require('crypto');

function mapRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    cardId: row.card_id,
    spaceId: row.space_id,
    provider: row.provider,
    providerAuthId: row.provider_auth_id,
    idempotencyKey: row.idempotency_key,
    amount: Number(row.amount),
    currency: row.currency,
    merchantName: row.merchant_name,
    merchantMcc: row.merchant_mcc,
    status: row.status,
    decision: row.decision,
    declineReason: row.decline_reason,
    riskStatus: row.risk_status,
    availableBalanceSnapshot:
      row.available_balance_snapshot === null
        ? null
        : Number(row.available_balance_snapshot),
    ledgerHoldId: row.ledger_hold_id || null,
    ledgerHoldRef: row.ledger_hold_ref || null,
    holdStatus: row.hold_status || null,
    requestPayload: row.request_payload,
    decisionedAt: row.decisioned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findById(cardsDb, id) {
  const result = await cardsDb.query(
    `
      SELECT *
      FROM card_authorizations
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return mapRow(result.rows[0]);
}

async function findByIdempotencyKey(cardsDb, idempotencyKey) {
  const result = await cardsDb.query(
    `
      SELECT *
      FROM card_authorizations
      WHERE idempotency_key = $1
      LIMIT 1
    `,
    [idempotencyKey]
  );

  return mapRow(result.rows[0]);
}

async function findByProviderAuthId(cardsDb, provider, providerAuthId) {
  if (!providerAuthId) return null;

  const result = await cardsDb.query(
    `
      SELECT *
      FROM card_authorizations
      WHERE provider = $1
        AND provider_auth_id = $2
      LIMIT 1
    `,
    [String(provider), String(providerAuthId)]
  );

  return mapRow(result.rows[0]);
}

async function insertDecisionedAuthorization(cardsDb, input) {
  const id = input.id || randomUUID();

  const result = await cardsDb.query(
    `
      INSERT INTO card_authorizations (
        id,
        card_id,
        space_id,
        provider,
        provider_auth_id,
        idempotency_key,
        amount,
        currency,
        merchant_name,
        merchant_mcc,
        status,
        decision,
        decline_reason,
        risk_status,
        available_balance_snapshot,
        ledger_hold_id,
        ledger_hold_ref,
        hold_status,
        request_payload,
        decisioned_at
      )
      VALUES (
        $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,  $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *
    `,
    [
      id,
      input.cardId,
      input.spaceId,
      String(input.provider),
      input.providerAuthId || null,
      String(input.idempotencyKey),
      Number(input.amount),
      String(input.currency).toUpperCase(),
      input.merchantName || null,
      input.merchantMcc || null,
      'decisioned',
      input.decision,
      input.declineReason || null,
      input.riskStatus || 'not_requested',
      input.availableBalanceSnapshot ?? null,
      input.ledgerHoldId || null,
      input.ledgerHoldRef || null,
      input.holdStatus || null,
      JSON.stringify(input.requestPayload || {}),
    ]
  );

  return mapRow(result.rows[0]);
}

async function attachLedgerHold(cardsDb, input) {
  const result = await cardsDb.query(
    `
      UPDATE card_authorizations
      SET
        ledger_hold_id = COALESCE(ledger_hold_id, $2),
        ledger_hold_ref = COALESCE(ledger_hold_ref, $3),
        hold_status = $4
      WHERE id = $1
      RETURNING *
    `,
    [
      input.authorizationId,
      input.ledgerHoldId,
      input.ledgerHoldRef,
      input.holdStatus || 'active',
    ]
  );

  return mapRow(result.rows[0]);
}

async function markHoldReleased(cardsDb, input) {
  const result = await cardsDb.query(
    `
      UPDATE card_authorizations
      SET hold_status = 'released'
      WHERE id = $1
      RETURNING *
    `,
    [input.authorizationId]
  );

  return mapRow(result.rows[0]);
}

module.exports = {
  findById,
  findByIdempotencyKey,
  findByProviderAuthId,
  insertDecisionedAuthorization,
  attachLedgerHold,
  markHoldReleased,
};

async function updateStatus(cardsDb, { authorizationId, status }) {
  const result = await cardsDb.query(
    `
      UPDATE card_authorizations
      SET status = $2
      WHERE id = $1
      RETURNING *
    `,
    [authorizationId, status]
  );

  return mapRow(result.rows[0]);
}

async function markCaptured(cardsDb, input) {
  const result = await cardsDb.query(
    `
      UPDATE card_authorizations
      SET
        status = 'captured',
        hold_status = 'released'
      WHERE id = $1
      RETURNING *
    `,
    [input.authorizationId]
  );

  return mapRow(result.rows[0]);
}

async function markReversed(cardsDb, input) {
  const result = await cardsDb.query(
    `
      UPDATE card_authorizations
      SET
        status = 'reversed',
        hold_status = 'released'
      WHERE id = $1
      RETURNING *
    `,
    [input.authorizationId]
  );

  return mapRow(result.rows[0]);
}

module.exports = {
  findById,
  findByIdempotencyKey,
  findByProviderAuthId,
  insertDecisionedAuthorization,
  attachLedgerHold,
  markHoldReleased,
  updateStatus,
  markCaptured,
  markReversed,
};