'use strict';

let cachedSource = null;

async function detectFreezeSource(financialDb) {
  if (cachedSource) return cachedSource;

  const candidates = [
    {
      key: 'budgets_soft.is_frozen',
      sql: `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'budgets_soft'
          AND column_name = 'is_frozen'
        LIMIT 1
      `,
    },
    {
      key: 'budgets_soft.frozen',
      sql: `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'budgets_soft'
          AND column_name = 'frozen'
        LIMIT 1
      `,
    },
    {
      key: 'ledger_accounts.is_frozen',
      sql: `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ledger_accounts'
          AND column_name = 'is_frozen'
        LIMIT 1
      `,
    },
    {
      key: 'ledger_accounts.frozen',
      sql: `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ledger_accounts'
          AND column_name = 'frozen'
        LIMIT 1
      `,
    },
  ];

  for (const candidate of candidates) {
    const result = await financialDb.query(candidate.sql);
    if (result.rows.length > 0) {
      cachedSource = candidate.key;
      return cachedSource;
    }
  }

  cachedSource = 'none';
  return cachedSource;
}

async function getSpaceFreezeState(financialDb, spaceId) {
  if (!spaceId) {
    return {
      spaceId: null,
      isFrozen: false,
      source: 'none',
    };
  }

  const source = await detectFreezeSource(financialDb);

  if (source === 'budgets_soft.is_frozen') {
    const result = await financialDb.query(
      `
        SELECT COALESCE(is_frozen, false) AS is_frozen
        FROM budgets_soft
        WHERE space_id = $1
        LIMIT 1
      `,
      [spaceId]
    );

    return {
      spaceId,
      isFrozen: result.rows[0]?.is_frozen === true,
      source,
    };
  }

  if (source === 'budgets_soft.frozen') {
    const result = await financialDb.query(
      `
        SELECT COALESCE(frozen, false) AS is_frozen
        FROM budgets_soft
        WHERE space_id = $1
        LIMIT 1
      `,
      [spaceId]
    );

    return {
      spaceId,
      isFrozen: result.rows[0]?.is_frozen === true,
      source,
    };
  }

  if (source === 'ledger_accounts.is_frozen') {
    const result = await financialDb.query(
      `
        SELECT bool_or(COALESCE(is_frozen, false)) AS is_frozen
        FROM ledger_accounts
        WHERE space_id = $1
      `,
      [spaceId]
    );

    return {
      spaceId,
      isFrozen: result.rows[0]?.is_frozen === true,
      source,
    };
  }

  if (source === 'ledger_accounts.frozen') {
    const result = await financialDb.query(
      `
        SELECT bool_or(COALESCE(frozen, false)) AS is_frozen
        FROM ledger_accounts
        WHERE space_id = $1
      `,
      [spaceId]
    );

    return {
      spaceId,
      isFrozen: result.rows[0]?.is_frozen === true,
      source,
    };
  }

  return {
    spaceId,
    isFrozen: false,
    source: 'none',
  };
}

module.exports = {
  getSpaceFreezeState,
};