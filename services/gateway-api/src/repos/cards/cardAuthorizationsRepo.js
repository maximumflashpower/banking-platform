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
    requestPayload: row.request_payload,
    decisionedAt: row.decisioned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
    [provider, providerAuthId]
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
        request_payload,
        decisioned_at
      )
      VALUES (
        $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,  $10,
        $11, $12, $13, $14, $15, $16, NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *
    `,
    [
      id,
      input.cardId,
      input.spaceId,
      input.provider,
      input.providerAuthId || null,
      input.idempotencyKey,
      input.amount,
      input.currency,
      input.merchantName || null,
      input.merchantMcc || null,
      'decisioned',
      input.decision,
      input.declineReason || null,
      input.riskStatus || 'not_requested',
      input.availableBalanceSnapshot ?? null,
      JSON.stringify(input.requestPayload || {})
    ]
  );

  return mapRow(result.rows[0]);
}

module.exports = {
  findByIdempotencyKey,
  findByProviderAuthId,
  insertDecisionedAuthorization
};