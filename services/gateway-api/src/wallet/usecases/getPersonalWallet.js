'use strict';

const { resolveActorContext } = require('../../kyc/services/resolveActorContext');
const { createAppError } = require('../errors');
const { findByUserIdAndSpaceId } = require('../repos/personalWalletRepo');

async function getPersonalWallet(req) {
  const { userId } = resolveActorContext(req);
  const spaceId = req.query?.space_id;

  if (!spaceId || typeof spaceId !== 'string') {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  const wallet = await findByUserIdAndSpaceId(userId, spaceId);

  if (!wallet) {
    throw createAppError(404, 'wallet_not_found', 'Personal wallet not found');
  }

  return {
    ok: true,
    stage: 'stage3b',
    action: 'get_personal_wallet',
    wallet,
  };
}

module.exports = {
  getPersonalWallet,
};