'use strict';

const { resolveActorContext } = require('../../kyc/services/resolveActorContext')
const { createAppError } = require('../errors');
const {
  findByUserIdAndSpaceId,
  updateEligibility,
} = require('../repos/personalFinancialProfileRepo');
const { findByUserIdAndSpaceId: findKycByUserIdAndSpaceId } = require('../../kyc/repos/personalKycRepo');

async function evaluatePersonalFinancialEligibility(req) {
  const { userId } = resolveActorContext(req);
  const body = req.body || {};
  const spaceId = body.space_id;

  if (!spaceId || typeof spaceId !== 'string') {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  const kyc = await findKycByUserIdAndSpaceId(userId, spaceId);
  if (!kyc || kyc.status !== 'verified') {
    throw createAppError(403, 'kyc_required', 'Verified KYC is required before eligibility evaluation');
  }

  const profile = await findByUserIdAndSpaceId(userId, spaceId);
  if (!profile) {
    throw createAppError(404, 'financial_profile_not_found', 'Personal financial profile not found');
  }

  let eligibilityStatus = 'eligible';
  let eligibilityReason = null;

  if (!profile.source_of_funds || !profile.occupation || !profile.country_of_residence) {
    eligibilityStatus = 'not_eligible';
    eligibilityReason = 'missing_required_financial_profile_fields';
  }

  const updated = await updateEligibility({
    userId,
    spaceId,
    eligibilityStatus,
    eligibilityReason,
  });

  return {
    ok: true,
    stage: 'stage3a2',
    action: 'evaluate_personal_financial_eligibility',
    eligibility_status: updated.eligibility_status,
    eligibility_reason: updated.eligibility_reason,
    reviewed_at: updated.reviewed_at,
  };
}

module.exports = {
  evaluatePersonalFinancialEligibility,
};