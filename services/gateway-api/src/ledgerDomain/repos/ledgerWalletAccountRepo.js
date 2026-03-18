'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.FINANCIAL_DATABASE_URL,
});

function buildLedgerWalletAccountId() {
  return `lwa_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function buildAccountCode({ userId, spaceId, walletId }) {
  const compactUser = String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'user';
  const compactSpace = String(spaceId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'space';
  const compactWallet = String(walletId).replace(/[^a-zA-Z0-9]/g, '').slice(-10) || 'wallet';
  return `WLT-${compactUser}-${compactSpace}-${compactWallet}`.toUpperCase();
}

async function findByWalletId(walletId) {
  const result = await pool.query(
    `
      SELECT
        id,
        wallet_id,
        user_id,
        space_id,
        account_code,
        account_type,
        currency,
        status,
        created_at,
        updated_at
      FROM ledger_wallet_accounts
      WHERE wallet_id = $1
      LIMIT 1
    `,
    [walletId]
  );

  return result.rows[0] || null;
}

async function createOpenAccountForWallet({
  walletId,
  userId,
  spaceId,
  currency,
}) {
  const accountCode = buildAccountCode({ userId, spaceId, walletId });

  const result = await pool.query(
    `
      INSERT INTO ledger_wallet_accounts (
        id,
        wallet_id,
        user_id,
        space_id,
        account_code,
        account_type,
        currency,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'wallet_liability', $6, 'open')
      RETURNING
        id,
        wallet_id,
        user_id,
        space_id,
        account_code,
        account_type,
        currency,
        status,
        created_at,
        updated_at
    `,
    [
      buildLedgerWalletAccountId(),
      walletId,
      userId,
      spaceId,
      accountCode,
      currency,
    ]
  );

  return result.rows[0];
}

module.exports = {
  findByWalletId,
  createOpenAccountForWallet,
};