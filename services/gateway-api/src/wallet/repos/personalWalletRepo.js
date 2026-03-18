'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.FINANCIAL_DATABASE_URL,
});

function buildWalletId() {
  return `wlt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function findByUserIdAndSpaceId(userId, spaceId) {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        space_id,
        status,
        wallet_type,
        currency,
        eligibility_snapshot,
        kyc_snapshot,
        ledger_account_id,
        ledger_status,
        ledger_last_error,
        activated_at,
        suspended_at,
        created_at,
        updated_at
      FROM personal_wallets
      WHERE user_id = $1
        AND space_id = $2
      LIMIT 1
    `,
    [userId, spaceId]
  );

  return result.rows[0] || null;
}

async function createActiveWallet({
  userId,
  spaceId,
  currency,
  eligibilitySnapshot,
  kycSnapshot,
}) {
  const result = await pool.query(
    `
      INSERT INTO personal_wallets (
        id,
        user_id,
        space_id,
        status,
        wallet_type,
        currency,
        eligibility_snapshot,
        kyc_snapshot,
        activated_at
      )
      VALUES ($1, $2, $3, 'active', 'personal', $4, $5, $6, NOW())
      RETURNING
        id,
        user_id,
        space_id,
        status,
        wallet_type,
        currency,
        eligibility_snapshot,
        kyc_snapshot,
        ledger_account_id,
        ledger_status,
        ledger_last_error,
        activated_at,
        suspended_at,
        created_at,
        updated_at
    `,
    [
      buildWalletId(),
      userId,
      spaceId,
      currency,
      eligibilitySnapshot,
      kycSnapshot,
    ]
  );

  return result.rows[0];
}

async function markLedgerProvisioned({
  walletId,
  ledgerAccountId,
}) {
  const result = await pool.query(
    `
      UPDATE personal_wallets
      SET
        ledger_account_id = $2,
        ledger_status = 'provisioned',
        ledger_last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        user_id,
        space_id,
        status,
        wallet_type,
        currency,
        eligibility_snapshot,
        kyc_snapshot,
        ledger_account_id,
        ledger_status,
        ledger_last_error,
        activated_at,
        suspended_at,
        created_at,
        updated_at
    `,
    [walletId, ledgerAccountId]
  );

  return result.rows[0] || null;
}

async function markLedgerProvisionFailed({
  walletId,
  ledgerLastError,
}) {
  const result = await pool.query(
    `
      UPDATE personal_wallets
      SET
        ledger_status = 'failed',
        ledger_last_error = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        user_id,
        space_id,
        status,
        wallet_type,
        currency,
        eligibility_snapshot,
        kyc_snapshot,
        ledger_account_id,
        ledger_status,
        ledger_last_error,
        activated_at,
        suspended_at,
        created_at,
        updated_at
    `,
    [walletId, ledgerLastError]
  );

  return result.rows[0] || null;
}

module.exports = {
  findByUserIdAndSpaceId,
  createActiveWallet,
  markLedgerProvisioned,
  markLedgerProvisionFailed,
};