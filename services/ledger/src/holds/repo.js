'use strict';

const financialDb = require('../infrastructure/financialDb');

async function findByHoldRef(holdRef, client = financialDb) {
  const { rows } = await client.query(
    `
      SELECT
        id,
        account_id,
        space_id,
        hold_ref,
        external_ref,
        amount,
        currency,
        status,
        reason,
        metadata,
        released_at,
        created_at,
        updated_at
      FROM ledger_holds
      WHERE hold_ref = $1
      LIMIT 1
    `,
    [holdRef]
  );

  return rows[0] || null;
}

async function findById(holdId, client = financialDb) {
  const { rows } = await client.query(
    `
      SELECT
        id,
        account_id,
        space_id,
        hold_ref,
        external_ref,
        amount,
        currency,
        status,
        reason,
        metadata,
        released_at,
        created_at,
        updated_at
      FROM ledger_holds
      WHERE id = $1
      LIMIT 1
    `,
    [holdId]
  );

  return rows[0] || null;
}

async function createHold(params, client = financialDb) {
  const {
    accountId,
    spaceId,
    holdRef,
    externalRef = null,
    amount,
    currency,
    reason,
    metadata = {},
  } = params;

  const { rows } = await client.query(
    `
      INSERT INTO ledger_holds (
        account_id,
        space_id,
        hold_ref,
        external_ref,
        amount,
        currency,
        status,
        reason,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8::jsonb)
      ON CONFLICT (hold_ref) DO NOTHING
      RETURNING
        id,
        account_id,
        space_id,
        hold_ref,
        external_ref,
        amount,
        currency,
        status,
        reason,
        metadata,
        released_at,
        created_at,
        updated_at
    `,
    [
      accountId,
      spaceId,
      holdRef,
      externalRef,
      amount,
      currency,
      reason,
      JSON.stringify(metadata),
    ]
  );

  return rows[0] || null;
}

async function releaseHoldByRef(holdRef, reason = 'manual_release', client = financialDb) {
  const { rows } = await client.query(
    `
      UPDATE ledger_holds
      SET
        status = 'released',
        released_at = COALESCE(released_at, now()),
        updated_at = now(),
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{release_reason}',
          to_jsonb($2::text),
          true
        )
      WHERE hold_ref = $1
        AND status = 'active'
      RETURNING
        id,
        account_id,
        space_id,
        hold_ref,
        external_ref,
        amount,
        currency,
        status,
        reason,
        metadata,
        released_at,
        created_at,
        updated_at
    `,
    [holdRef, reason]
  );

  return rows[0] || null;
}

module.exports = {
  findByHoldRef,
  findById,
  createHold,
  releaseHoldByRef,
};