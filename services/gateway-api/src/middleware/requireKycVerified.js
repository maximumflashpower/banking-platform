'use strict';

const { createAppError } = require('../kyc/errors');
const { resolveActorContext } = require('../kyc/services/resolveActorContext');
const { findByUserIdAndSpaceId } = require('../kyc/repos/personalKycRepo');

async function requireKycVerified(req, _res, next) {
  try {
    const { userId } = resolveActorContext(req);

    const spaceId =
      req.body?.space_id ||
      req.query?.space_id ||
      req.params?.space_id ||
      null;

    if (!spaceId || typeof spaceId !== 'string' || !spaceId.trim()) {
      throw createAppError(400, 'invalid_request', 'space_id is required');
    }

    const session = await findByUserIdAndSpaceId(userId, spaceId);

    if (!session || session.status !== 'verified') {
      throw createAppError(403, 'kyc_required', 'KYC verification required');
    }

    req.kyc = {
      status: session.status,
      identity_verified_at: session.identity_verified_at,
      session_id: session.id,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireKycVerified,
};