const ledgerEntryRepo = require('../repos/ledgerEntryRepo');

function normalizeAmount(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function createLedgerEntry(input) {
  const debit_account_id = input?.debit_account_id?.trim();
  const credit_account_id = input?.credit_account_id?.trim();
  const currency = input?.currency?.trim()?.toUpperCase();
  const amount = normalizeAmount(input?.amount);
  const reference_type = input?.reference_type || null;
  const reference_id = input?.reference_id || null;

  if (!debit_account_id) {
    const error = new Error('debit_account_id is required');
    error.statusCode = 400;
    error.code = 'LEDGER_DEBIT_ACCOUNT_REQUIRED';
    throw error;
  }

  if (!credit_account_id) {
    const error = new Error('credit_account_id is required');
    error.statusCode = 400;
    error.code = 'LEDGER_CREDIT_ACCOUNT_REQUIRED';
    throw error;
  }

  if (debit_account_id === credit_account_id) {
    const error = new Error('debit_account_id and credit_account_id must be different');
    error.statusCode = 400;
    error.code = 'LEDGER_ACCOUNTS_MUST_DIFFER';
    throw error;
  }

  if (!amount) {
    const error = new Error('amount must be a positive integer');
    error.statusCode = 400;
    error.code = 'LEDGER_INVALID_AMOUNT';
    throw error;
  }

  if (!currency) {
    const error = new Error('currency is required');
    error.statusCode = 400;
    error.code = 'LEDGER_CURRENCY_REQUIRED';
    throw error;
  }

  try {
    const entry = await ledgerEntryRepo.createEntry({
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      reference_type,
      reference_id
    });

    return {
      ok: true,
      entry
    };
  } catch (cause) {
    const error = new Error('failed to create ledger entry');
    error.statusCode = 500;
    error.code = 'LEDGER_ENTRY_CREATE_FAILED';
    error.cause = cause;
    throw error;
  }
}

module.exports = createLedgerEntry;