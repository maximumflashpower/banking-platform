'use strict';

const financialDb = require('../../infrastructure/financialDb');

async function getWalletBalance({ walletId }) {
  const mapping = await financialDb.query(
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

  if (!mapping.rows || mapping.rows.length === 0) {
    return {
      ok: false,
      code: 'WALLET_LEDGER_ACCOUNT_NOT_FOUND',
      message: `No ledger account mapping for wallet_id=${walletId}`
    };
  }

  const account = mapping.rows[0];

  const balanceResult = await financialDb.query(
    `
    SELECT COALESCE(SUM(delta), 0) AS balance
    FROM (
      SELECT amount AS delta
      FROM ledger_entries
      WHERE credit_account_id = $1

      UNION ALL

      SELECT -amount AS delta
      FROM ledger_entries
      WHERE debit_account_id = $1
    ) movements
    `,
    [account.id]
  );

  return {
    ok: true,
    data: {
      wallet_id: walletId,
      ledger_account_id: account.id,
      account_code: account.account_code,
      currency: account.currency,
      status: account.status,
      balance: Number(balanceResult.rows?.[0]?.balance || 0)
    }
  };
}

module.exports = getWalletBalance;