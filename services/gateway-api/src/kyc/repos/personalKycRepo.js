'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.IDENTITY_DATABASE_URL,
});

async function findByUserIdAndSpaceId(userId, spaceId) {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        space_id,
        status,
        document_front_url,
        document_back_url,
        selfie_url,
        liveness_video_url,
        face_match_score,
        liveness_score,
        identity_verified_at,
        rejection_reason,
        created_at,
        updated_at
      FROM personal_kyc_sessions
      WHERE user_id = $1
        AND space_id = $2
      LIMIT 1
    `,
    [userId, spaceId]
  );

  return result.rows[0] || null;
}

async function createPendingDocumentsSession({
  id,
  userId,
  spaceId,
}) {
  const result = await pool.query(
    `
      INSERT INTO personal_kyc_sessions (
        id,
        user_id,
        space_id,
        status
      )
      VALUES ($1, $2, $3, 'pending_documents')
      RETURNING
        id,
        user_id,
        space_id,
        status,
        document_front_url,
        document_back_url,
        selfie_url,
        liveness_video_url,
        face_match_score,
        liveness_score,
        identity_verified_at,
        rejection_reason,
        created_at,
        updated_at
    `,
    [id, userId, spaceId]
  );

  return result.rows[0];
}

async function updateDocumentsAndMoveToUnderReview({
  userId,
  spaceId,
  documentFrontUrl,
  documentBackUrl,
  selfieUrl,
  livenessVideoUrl,
  faceMatchScore,
  livenessScore,
}) {
  const result = await pool.query(
    `
      UPDATE personal_kyc_sessions
      SET
        document_front_url = $3,
        document_back_url = $4,
        selfie_url = $5,
        liveness_video_url = $6,
        face_match_score = $7,
        liveness_score = $8,
        status = 'under_review',
        updated_at = NOW()
      WHERE user_id = $1
        AND space_id = $2
      RETURNING
        id,
        user_id,
        space_id,
        status,
        document_front_url,
        document_back_url,
        selfie_url,
        liveness_video_url,
        face_match_score,
        liveness_score,
        identity_verified_at,
        rejection_reason,
        created_at,
        updated_at
    `,
    [
      userId,
      spaceId,
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
      livenessVideoUrl,
      faceMatchScore,
      livenessScore,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  findByUserIdAndSpaceId,
  createPendingDocumentsSession,
  updateDocumentsAndMoveToUnderReview,
};