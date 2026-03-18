'use strict';

const { createAppError } = require('../errors');
const { resolveActorContext } = require('../services/resolveActorContext');
const {
  findByUserIdAndSpaceId,
  updateDocumentsAndMoveToUnderReview,
} = require('../repos/personalKycRepo');

function isValidScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

async function submitPersonalKycDocuments(req) {
  const body = req.body || {};
  const spaceId = body.space_id;

  if (!spaceId || typeof spaceId !== 'string' || !spaceId.trim()) {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  if (!body.document_front_url || typeof body.document_front_url !== 'string') {
    throw createAppError(400, 'invalid_request', 'document_front_url is required');
  }

  if (!body.document_back_url || typeof body.document_back_url !== 'string') {
    throw createAppError(400, 'invalid_request', 'document_back_url is required');
  }

  if (!body.selfie_url || typeof body.selfie_url !== 'string') {
    throw createAppError(400, 'invalid_request', 'selfie_url is required');
  }

  if (!body.liveness_video_url || typeof body.liveness_video_url !== 'string') {
    throw createAppError(400, 'invalid_request', 'liveness_video_url is required');
  }

  if (!isValidScore(body.face_match_score)) {
    throw createAppError(400, 'invalid_request', 'face_match_score must be a number between 0 and 1');
  }

  if (!isValidScore(body.liveness_score)) {
    throw createAppError(400, 'invalid_request', 'liveness_score must be a number between 0 and 1');
  }

  const { userId } = resolveActorContext(req);
  const existing = await findByUserIdAndSpaceId(userId, spaceId);

  if (!existing) {
    throw createAppError(404, 'kyc_session_not_found', 'Personal KYC session not found');
  }

  if (existing.status === 'verified') {
    throw createAppError(409, 'kyc_already_verified', 'Personal KYC session is already verified');
  }

  if (existing.status === 'under_review') {
    throw createAppError(409, 'kyc_already_under_review', 'Personal KYC session is already under review');
  }

  const updated = await updateDocumentsAndMoveToUnderReview({
    userId,
    spaceId,
    documentFrontUrl: body.document_front_url,
    documentBackUrl: body.document_back_url,
    selfieUrl: body.selfie_url,
    livenessVideoUrl: body.liveness_video_url,
    faceMatchScore: body.face_match_score,
    livenessScore: body.liveness_score,
  });

  if (!updated) {
    throw createAppError(500, 'kyc_update_failed', 'Failed to update personal KYC documents');
  }

	  return {
	  ok: true,
	  stage: 'stage3a1',
	  action: 'submit_personal_kyc_documents',
	  id: updated.id,
	  user_id: updated.user_id,
	  space_id: updated.space_id,
	  status: updated.status,
	  document_front_url: updated.document_front_url,
	  document_back_url: updated.document_back_url,
	  selfie_url: updated.selfie_url,
	  liveness_video_url: updated.liveness_video_url,
	  face_match_score: updated.face_match_score !== null ? Number(updated.face_match_score) : null,
	  liveness_score: updated.liveness_score !== null ? Number(updated.liveness_score) : null,
	  created_at: updated.created_at,
	  updated_at: updated.updated_at,
	  message: 'Personal KYC documents submitted and moved to under_review',
	};
}

module.exports = {
  submitPersonalKycDocuments,
};