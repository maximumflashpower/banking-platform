const crypto = require('crypto');
const financialDb = require('../../infrastructure/financialDb');

function buildEntryId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `le_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function createEntry({
  id,
  debit_account_id,
  credit_account_id,
  amount,
  currency,
  reference_type = null,
  reference_id = null
}) {
  const entryId = id || buildEntryId();

  const query = `
    INSERT INTO ledger_entries (
      id,
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      reference_type,
      reference_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id,
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      reference_type,
      reference_id,
      created_at
  `;

  const values = [
    entryId,
    debit_account_id,
    credit_account_id,
    amount,
    currency,
    reference_type,
    reference_id
  ];

  const result = await financialDb.query(query, values);
  return result.rows[0];
}

async function getBalance(accountId) {
  const query = `
    SELECT
      COALESCE(SUM(CASE WHEN credit_account_id = $1 THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN debit_account_id = $1 THEN amount ELSE 0 END), 0) AS balance
    FROM ledger_entries
  `;

  const result = await financialDb.query(query, [accountId]);

  return {
    account_id: accountId,
    balance: Number(result.rows[0]?.balance || 0)
  };
}

module.exports = {
  createEntry,
  getBalance
};