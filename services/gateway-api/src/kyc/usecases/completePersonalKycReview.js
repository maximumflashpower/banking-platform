'use strict';

async function completePersonalKycReview(req) {
  const body = req.body || {};

  return {
    ok: true,
    stage: 'stage3a1',
    action: 'complete_personal_kyc_review',
    user_id: body.user_id || null,
    space_id: body.space_id || null,
    decision: body.decision || null,
    rejection_reason: body.rejection_reason || null,
    message: 'Personal KYC review placeholder active',
  };
}

module.exports = {
  completePersonalKycReview,
};