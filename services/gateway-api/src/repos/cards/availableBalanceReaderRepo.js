'use strict';

let cachedBalanceSource = null;

async function detectBalanceSource(financialDb) {
  if (cachedBalanceSource) return cachedBalanceSource;

  const candidates = [
    {
      key: 'ledger_accounts.available_balance',
      sql: `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ledger_accounts'
          AND column_name = 'available_balance'
        LIMIT 1
      `,
    },
    {
      key: 'ledger_accounts.current_balance',
      sql: `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ledger_accounts'
          AND column_name = 'current_balance'
        LIMIT 1
      `,
    },
    {
      key: 'ledger_accounts.balance',
      sql: `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ledger_accounts'
          AND column_name = 'balance'
        LIMIT 1
      `,
    },
  ];

  for (const candidate of candidates) {
    const result = await financialDb.query(candidate.sql);
    if (result.rows.length > 0) {
      cachedBalanceSource = candidate.key;
      return cachedBalanceSource;
    }
  }

  cachedBalanceSource = 'none';
  return cachedBalanceSource;
}

async function getAvailableBalance(financialDb, spaceId) {
  if (!spaceId) {
    return {
      spaceId: null,
      availableBalance: 0,
      source: 'none',
    };
  }

  const source = await detectBalanceSource(financialDb);

  if (source === 'ledger_accounts.available_balance') {
    const result = await financialDb.query(
      `
        SELECT COALESCE(SUM(available_balance), 0) AS available_balance
        FROM ledger_accounts
        WHERE space_id = $1
      `,
      [spaceId]
    );

    return {
      spaceId,
      availableBalance: Number(result.rows[0]?.available_balance || 0),
      source,
    };
  }

  if (source === 'ledger_accounts.current_balance') {
    const result = await financialDb.query(
      `
        SELECT COALESCE(SUM(current_balance), 0) AS available_balance
        FROM ledger_accounts
        WHERE space_id = $1
      `,
      [spaceId]
    );

    return {
      spaceId,
      availableBalance: Number(result.rows[0]?.available_balance || 0),
      source,
    };
  }

  if (source === 'ledger_accounts.balance') {
    const result = await financialDb.query(
      `
        SELECT COALESCE(SUM(balance), 0) AS available_balance
        FROM ledger_accounts
        WHERE space_id = $1
      `,
      [spaceId]
    );

    return {
      spaceId,
      availableBalance: Number(result.rows[0]?.available_balance || 0),
      source,
    };
  }

  return {
    spaceId,
    availableBalance: 0,
    source: 'none',
  };
}

module.exports = {
  getAvailableBalance,
};