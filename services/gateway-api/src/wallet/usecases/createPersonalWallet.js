'use strict';

const { resolveActorContext } = require('../../kyc/services/resolveActorContext');
const { createAppError } = require('../errors');
const {
  findByUserIdAndSpaceId: findWalletByUserIdAndSpaceId,
  createActiveWallet,
  markLedgerProvisioned,
  markLedgerProvisionFailed,
} = require('../repos/personalWalletRepo');
const {
  findByUserIdAndSpaceId: findKycByUserIdAndSpaceId,
} = require('../../kyc/repos/personalKycRepo');
const {
  findByUserIdAndSpaceId: findFinancialProfileByUserIdAndSpaceId,
} = require('../../financialProfile/repos/personalFinancialProfileRepo');
const {
  findByWalletId,
  createOpenAccountForWallet,
} = require('../../ledgerDomain/repos/ledgerWalletAccountRepo');

async function ensureLedgerForWallet(wallet) {
  const existing = await findByWalletId(wallet.id);
  if (existing) {
    return existing;
  }

  return createOpenAccountForWallet({
    walletId: wallet.id,
    userId: wallet.user_id,
    spaceId: wallet.space_id,
    currency: wallet.currency,
  });
}

async function createPersonalWallet(req) {
  const body = req.body || {};
  const { userId } = resolveActorContext(req);
  const spaceId = body.space_id;
  const currency = body.currency || 'USD';

  if (!spaceId || typeof spaceId !== 'string') {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  if (typeof currency !== 'string' || !currency.trim()) {
    throw createAppError(400, 'invalid_request', 'currency is required');
  }

  const existingWallet = await findWalletByUserIdAndSpaceId(userId, spaceId);
  if (existingWallet) {
    return {
      ok: true,
      stage: 'stage3c',
      action: 'create_personal_wallet_with_ledger_provisioning',
      wallet: existingWallet,
      message: 'Personal wallet already exists',
    };
  }

  const kyc = await findKycByUserIdAndSpaceId(userId, spaceId);
  if (!kyc || kyc.status !== 'verified') {
    throw createAppError(403, 'kyc_required', 'Verified KYC is required before wallet creation');
  }

  const profile = await findFinancialProfileByUserIdAndSpaceId(userId, spaceId);
  if (!profile) {
    throw createAppError(404, 'financial_profile_not_found', 'Personal financial profile not found');
  }

  if (profile.eligibility_status !== 'eligible') {
    throw createAppError(403, 'not_eligible', 'Eligible financial profile is required before wallet creation');
  }

  let wallet = await createActiveWallet({
    userId,
    spaceId,
    currency: currency.trim().toUpperCase(),
    eligibilitySnapshot: JSON.stringify({
      eligibility_status: profile.eligibility_status,
      eligibility_reason: profile.eligibility_reason,
      reviewed_at: profile.reviewed_at,
    }),
    kycSnapshot: JSON.stringify({
      status: kyc.status,
      identity_verified_at: kyc.identity_verified_at,
    }),
  });

  try {
    const ledgerAccount = await ensureLedgerForWallet(wallet);
    wallet = await markLedgerProvisioned({
      walletId: wallet.id,
      ledgerAccountId: ledgerAccount.id,
    });
  } catch (err) {
    wallet = await markLedgerProvisionFailed({
      walletId: wallet.id,
      ledgerLastError: err?.message || 'ledger_provision_failed',
    });
  }

  return {
    ok: true,
    stage: 'stage3b',
    action: 'create_personal_wallet',
    wallet,
    message: 'Personal wallet created',
  };
}

module.exports = {
  createPersonalWallet,
};