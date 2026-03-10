'use strict';

const financialDb = require('../../infrastructure/financialDb');

async function getBalances({ accountId, currency }) {
  const normalizedCurrency = String(currency || 'USD').trim().toUpperCase();

  const postingsResult = await financialDb.query(
    `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN direction = 'DEBIT' THEN amount_minor
            WHEN direction = 'CREDIT' THEN -amount_minor
            ELSE 0
          END
        ), 0) AS current_balance
      FROM ledger_postings
      WHERE account_id = $1
        AND currency = $2
    `,
    [accountId, normalizedCurrency]
  );

  const holdsResult = await financialDb.query(
    `
      SELECT COALESCE(SUM(amount), 0) AS held_balance
      FROM ledger_holds
      WHERE account_id = $1
        AND currency = $2
        AND status = 'active'
        AND released_at IS NULL
    `,
    [accountId, normalizedCurrency]
  );

  const currentBalance = Number(postingsResult.rows[0]?.current_balance || 0);
  const heldBalance = Number(holdsResult.rows[0]?.held_balance || 0);
  const availableBalance = currentBalance - heldBalance;

  return {
    accountId,
    currency: normalizedCurrency,
    currentBalance,
    heldBalance,
    availableBalance,
  };
}

module.exports = {
  getBalances,
};