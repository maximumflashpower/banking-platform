'use strict';

const crypto = require('crypto');
const { createAppError } = require('../errors');
const { resolveActorContext } = require('../services/resolveActorContext');
const {
  findByUserIdAndSpaceId,
  createPendingDocumentsSession,
} = require('../repos/personalKycRepo');

function buildKycId() {
  return `kyc_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function startPersonalKyc(req) {
  const body = req.body || {};
  const spaceId = body.space_id;

  if (!spaceId || typeof spaceId !== 'string' || !spaceId.trim()) {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  const { userId } = resolveActorContext(req);

  const existing = await findByUserIdAndSpaceId(userId, spaceId);

  if (existing) {
    return {
      ok: true,
      stage: 'stage3a1',
      action: 'start_personal_kyc',
      id: existing.id,
      user_id: existing.user_id,
      space_id: existing.space_id,
      status: existing.status,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
      message: 'Personal KYC session already exists',
    };
  }

  const created = await createPendingDocumentsSession({
    id: buildKycId(),
    userId,
    spaceId,
  });

  return {
    ok: true,
    stage: 'stage3a1',
    action: 'start_personal_kyc',
    id: created.id,
    user_id: created.user_id,
    space_id: created.space_id,
    status: created.status,
    created_at: created.created_at,
    updated_at: created.updated_at,
    message: 'Personal KYC session created',
  };
}

module.exports = {
  startPersonalKyc,
};