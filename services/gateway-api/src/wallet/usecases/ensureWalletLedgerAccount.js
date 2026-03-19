'use strict';

const financialDb = require('../../infrastructure/financialDb');

async function ensureWalletLedgerAccount({ walletId }) {
  const result = await financialDb.query(
    `
    SELECT
      id,
      wallet_id,
      account_code,
      currency,
      status
    FROM ledger_wallet_accounts
    WHERE wallet_id = $1
    LIMIT 1
    `,
    [walletId]
  );

  if (!result.rows || result.rows.length === 0) {
    return {
      ok: false,
      code: 'WALLET_LEDGER_ACCOUNT_NOT_FOUND',
      message: `Missing ledger account mapping for wallet_id=${walletId}`
    };
  }

  return {
    ok: true,
    data: {
      ledger_account_id: result.rows[0].id,
      wallet_id: result.rows[0].wallet_id,
      account_code: result.rows[0].account_code,
      currency: result.rows[0].currency,
      status: result.rows[0].status
    }
  };
}

module.exports = ensureWalletLedgerAccount;