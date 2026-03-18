const financialDb = require('../../infrastructure/financialDb');

async function getWalletLedgerAccount(walletId) {
  const query = `
    SELECT wallet_id, account_code
    FROM ledger_wallet_accounts
    WHERE wallet_id = $1
    LIMIT 1
  `;

  const result = await financialDb.query(query, [walletId]);
  return result.rows[0] || null;
}

async function findByReference(referenceType, referenceId) {
  const query = `
    SELECT
      id,
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      reference_type,
      reference_id,
      created_at
    FROM ledger_entries
    WHERE reference_type = $1
      AND reference_id = $2
    LIMIT 1
  `;

  const result = await financialDb.query(query, [referenceType, referenceId]);
  return result.rows[0] || null;
}

module.exports = {
  getWalletLedgerAccount,
  findByReference
};
