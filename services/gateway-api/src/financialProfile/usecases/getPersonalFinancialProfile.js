'use strict';

const { resolveActorContext } = require('../../kyc/services/resolveActorContext')
const { createAppError } = require('../errors');
const { findByUserIdAndSpaceId } = require('../repos/personalFinancialProfileRepo');

async function getPersonalFinancialProfile(req) {
  const { userId } = resolveActorContext(req);
  const spaceId = req.query?.space_id;

  if (!spaceId || typeof spaceId !== 'string') {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  const profile = await findByUserIdAndSpaceId(userId, spaceId);

  if (!profile) {
    throw createAppError(404, 'financial_profile_not_found', 'Personal financial profile not found');
  }

  return {
    ok: true,
    stage: 'stage3a2',
    action: 'get_personal_financial_profile',
    profile,
  };
}

module.exports = {
  getPersonalFinancialProfile,
};