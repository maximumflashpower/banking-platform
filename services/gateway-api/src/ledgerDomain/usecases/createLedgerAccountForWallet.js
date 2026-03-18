'use strict';

const { createAppError } = require('../errors');
const {
  findByWalletId,
  createOpenAccountForWallet,
} = require('../repos/ledgerWalletAccountRepo');

async function createLedgerAccountForWallet(req) {
  const body = req.body || {};
  const walletId = body.wallet_id;
  const userId = body.user_id;
  const spaceId = body.space_id;
  const currency = body.currency || 'USD';

  if (!walletId || typeof walletId !== 'string') {
    throw createAppError(400, 'invalid_request', 'wallet_id is required');
  }

  if (!userId || typeof userId !== 'string') {
    throw createAppError(400, 'invalid_request', 'user_id is required');
  }

  if (!spaceId || typeof spaceId !== 'string') {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  const existing = await findByWalletId(walletId);

  if (existing) {
    return {
      ok: true,
      stage: 'stage3c',
      action: 'create_ledger_account_for_wallet',
      ledger_account: existing,
      message: 'Ledger account already exists for wallet',
    };
  }

  const created = await createOpenAccountForWallet({
    walletId,
    userId,
    spaceId,
    currency: String(currency).trim().toUpperCase(),
  });

  return {
    ok: true,
    stage: 'stage3c',
    action: 'create_ledger_account_for_wallet',
    ledger_account: created,
    message: 'Ledger account created for wallet',
  };
}

module.exports = {
  createLedgerAccountForWallet,
};