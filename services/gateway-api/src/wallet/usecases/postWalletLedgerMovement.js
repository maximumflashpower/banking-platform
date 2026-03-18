const walletLedgerMovementRepo = require('../repos/walletLedgerMovementRepo');
const createLedgerEntry = require('../../ledgerDomain/usecases/createLedgerEntry');

function parsePositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function postWalletLedgerMovement(input) {
  const wallet_id = input?.wallet_id?.trim();
  const direction = input?.direction?.trim()?.toLowerCase();
  const amount = parsePositiveInteger(input?.amount);
  const currency = input?.currency?.trim()?.toUpperCase();
  const reference_type = input?.reference_type?.trim();
  const reference_id = input?.reference_id?.trim();

  if (!wallet_id) {
    const error = new Error('wallet_id is required');
    error.statusCode = 400;
    error.code = 'WALLET_ID_REQUIRED';
    throw error;
  }

  if (!direction || !['credit', 'debit'].includes(direction)) {
    const error = new Error('direction must be credit or debit');
    error.statusCode = 400;
    error.code = 'WALLET_MOVEMENT_INVALID_DIRECTION';
    throw error;
  }

  if (!amount) {
    const error = new Error('amount must be a positive integer');
    error.statusCode = 400;
    error.code = 'WALLET_MOVEMENT_INVALID_AMOUNT';
    throw error;
  }

  if (!currency) {
    const error = new Error('currency is required');
    error.statusCode = 400;
    error.code = 'WALLET_MOVEMENT_CURRENCY_REQUIRED';
    throw error;
  }

  if (!reference_type) {
    const error = new Error('reference_type is required');
    error.statusCode = 400;
    error.code = 'WALLET_MOVEMENT_REFERENCE_TYPE_REQUIRED';
    throw error;
  }

  if (!reference_id) {
    const error = new Error('reference_id is required');
    error.statusCode = 400;
    error.code = 'WALLET_MOVEMENT_REFERENCE_ID_REQUIRED';
    throw error;
  }

  try {
    const existing = await walletLedgerMovementRepo.findByReference(reference_type, reference_id);

    if (existing) {
      return {
        ok: true,
        idempotent: true,
        entry: existing
      };
    }

    const walletLedgerLink = await walletLedgerMovementRepo.getWalletLedgerAccount(wallet_id);

    if (!walletLedgerLink?.account_code) {
      const error = new Error('wallet ledger account not found');
      error.statusCode = 404;
      error.code = 'WALLET_LEDGER_ACCOUNT_NOT_FOUND';
      throw error;
    }

    const walletLedgerAccountId = walletLedgerLink.account_code;

    const debit_account_id =
      direction === 'credit' ? 'SYSTEM_CASH' : walletLedgerAccountId;

    const credit_account_id =
      direction === 'credit' ? walletLedgerAccountId : 'SYSTEM_CASH';

    const result = await createLedgerEntry({
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      reference_type,
      reference_id
    });

    return {
      ok: true,
      idempotent: false,
      entry: result.entry
    };
  } catch (cause) {
    if (cause.statusCode) {
      throw cause;
    }

    const error = new Error(`failed to post wallet ledger movement: ${cause.message}`);
    error.statusCode = 500;
    error.code = 'WALLET_LEDGER_MOVEMENT_FAILED';
    throw error;
  }
}

module.exports = postWalletLedgerMovement;
