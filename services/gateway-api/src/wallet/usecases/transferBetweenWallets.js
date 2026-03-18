const createLedgerEntry = require('../../ledgerDomain/usecases/createLedgerEntry');
const walletLedgerMovementRepo = require('../repos/walletLedgerMovementRepo');

function throwError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  throw err;
}

async function transferBetweenWallets(input) {
  const {
    from_wallet_id,
    to_wallet_id,
    amount,
    currency,
    reference_type,
    reference_id,
  } = input || {};

  if (!from_wallet_id || !to_wallet_id) {
    throwError(400, 'invalid_request', 'wallet ids required');
  }

  if (from_wallet_id === to_wallet_id) {
    throwError(400, 'WALLET_TRANSFER_SAME_WALLET', 'cannot transfer to same wallet');
  }

  if (!amount || Number(amount) <= 0) {
    throwError(400, 'invalid_amount', 'amount must be > 0');
  }

  const fromLedger = await walletLedgerMovementRepo.getWalletLedgerAccount(from_wallet_id);
  const toLedger = await walletLedgerMovementRepo.getWalletLedgerAccount(to_wallet_id);

  if (!fromLedger) {
    throwError(404, 'WALLET_TRANSFER_SOURCE_LEDGER_NOT_FOUND', 'source wallet ledger not found');
  }

  if (!toLedger) {
    throwError(404, 'WALLET_TRANSFER_DEST_LEDGER_NOT_FOUND', 'destination wallet ledger not found');
  }

  const result = await createLedgerEntry({
    debit_account_id: fromLedger.account_code,
    credit_account_id: toLedger.account_code,
    amount: Number(amount),
    currency,
    reference_type,
    reference_id,
  });

  return result.entry || result;
}

module.exports = transferBetweenWallets;
