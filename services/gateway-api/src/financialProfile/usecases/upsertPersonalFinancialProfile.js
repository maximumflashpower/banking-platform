'use strict';

const { resolveActorContext } = require('../../kyc/services/resolveActorContext');
const { createAppError } = require('../errors');
const { upsertProfile } = require('../repos/personalFinancialProfileRepo');
const { findByUserIdAndSpaceId: findKycByUserIdAndSpaceId } = require('../../kyc/repos/personalKycRepo');

async function upsertPersonalFinancialProfile(req) {
  const body = req.body || {};
  const { userId } = resolveActorContext(req);
  const spaceId = body.space_id;

  if (!spaceId || typeof spaceId !== 'string') {
    throw createAppError(400, 'invalid_request', 'space_id is required');
  }

  const requiredFields = [
    ['legal_name', body.legal_name],
    ['date_of_birth', body.date_of_birth],
    ['country_of_residence', body.country_of_residence],
    ['nationality', body.nationality],
    ['tax_id_last4', body.tax_id_last4],
    ['occupation', body.occupation],
    ['source_of_funds', body.source_of_funds],
  ];

  for (const [field, value] of requiredFields) {
    if (!value || typeof value !== 'string') {
      throw createAppError(400, 'invalid_request', `${field} is required`);
    }
  }

  const kyc = await findKycByUserIdAndSpaceId(userId, spaceId);
  if (!kyc || kyc.status !== 'verified') {
    throw createAppError(403, 'kyc_required', 'Verified KYC is required before financial profile setup');
  }

  const profile = await upsertProfile({
    userId,
    spaceId,
    legalName: body.legal_name,
    dateOfBirth: body.date_of_birth,
    countryOfResidence: body.country_of_residence,
    nationality: body.nationality,
    taxIdLast4: body.tax_id_last4,
    occupation: body.occupation,
    sourceOfFunds: body.source_of_funds,
  });

  return {
    ok: true,
    stage: 'stage3a2',
    action: 'upsert_personal_financial_profile',
    profile,
  };
}

module.exports = {
  upsertPersonalFinancialProfile,
};