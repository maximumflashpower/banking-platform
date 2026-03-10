'use strict';

async function getCashAccount(financialDb, spaceId, currency = 'USD') {
  const result = await financialDb.query(
    `
      SELECT id, space_id, code, name, currency
      FROM ledger_accounts
      WHERE space_id = $1
        AND code = 'CASH'
        AND currency = $2
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT 1
    `,
    [spaceId, currency]
  );

  return result.rows[0] || null;
}

async function readPostedBalance(financialDb, accountId, currency = 'USD') {
  const result = await financialDb.query(
    `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN direction = 'DEBIT' THEN amount_minor
            WHEN direction = 'CREDIT' THEN -amount_minor
            ELSE 0
          END
        ), 0) AS posted_balance
      FROM ledger_postings
      WHERE account_id = $1
        AND currency = $2
    `,
    [accountId, currency]
  );

  return Number(result.rows[0]?.posted_balance || 0);
}

async function readHeldBalance(financialDb, accountId, currency = 'USD') {
  const result = await financialDb.query(
    `
      SELECT COALESCE(SUM(amount), 0) AS held_balance
      FROM ledger_holds
      WHERE account_id = $1
        AND currency = $2
        AND status = 'active'
    `,
    [accountId, currency]
  );

  return Number(result.rows[0]?.held_balance || 0);
}

async function getAvailableBalance(financialDb, spaceId, currency = 'USD') {
  if (!spaceId) {
    return {
      spaceId: null,
      accountId: null,
      currency,
      baseBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
      source: 'none',
    };
  }

  const cashAccount = await getCashAccount(financialDb, spaceId, currency);

  if (!cashAccount) {
    return {
      spaceId,
      accountId: null,
      currency,
      baseBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
      source: 'ledger_postings+ledger_holds',
    };
  }

  const baseBalance = await readPostedBalance(financialDb, cashAccount.id, currency);
  const heldBalance = await readHeldBalance(financialDb, cashAccount.id, currency);
  const availableBalance = Math.max(0, baseBalance - heldBalance);

  return {
    spaceId,
    accountId: cashAccount.id,
    currency,
    baseBalance,
    heldBalance,
    availableBalance,
    source: 'ledger_postings+ledger_holds',
  };
}

module.exports = {
  getAvailableBalance,
};