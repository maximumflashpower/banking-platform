'use strict';

const { createAppError } = require('../errors');
const { resolveActorContext } = require('../services/resolveActorContext');
const { findByUserIdAndSpaceId } = require('../repos/personalKycRepo');

async function getPersonalKycStatus(req) {
  const spaceId = req.query?.space_id;

  if (!spaceId || typeof spaceId !== 'string' || !spaceId.trim()) {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  const { userId } = resolveActorContext(req);

  const existing = await findByUserIdAndSpaceId(userId, spaceId);

  if (!existing) {
    return {
      ok: true,
      stage: 'stage3a1',
      action: 'get_personal_kyc_status',
      space_id: spaceId,
      status: 'not_started',
    };
  }

	  return {
	  ok: true,
	  stage: 'stage3a1',
	  action: 'get_personal_kyc_status',
	  id: existing.id,
	  user_id: existing.user_id,
	  space_id: existing.space_id,
	  status: existing.status,
	  document_front_url: existing.document_front_url,
	  document_back_url: existing.document_back_url,
	  selfie_url: existing.selfie_url,
	  liveness_video_url: existing.liveness_video_url,
	  face_match_score: existing.face_match_score !== null ? Number(existing.face_match_score) : null,
	  liveness_score: existing.liveness_score !== null ? Number(existing.liveness_score) : null,
	  identity_verified_at: existing.identity_verified_at,
	  rejection_reason: existing.rejection_reason,
	  created_at: existing.created_at,
	  updated_at: existing.updated_at,
   };
}

module.exports = {
  getPersonalKycStatus,
};