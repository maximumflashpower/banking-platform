'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.IDENTITY_DATABASE_URL,
});

function buildFinancialProfileId() {
  return `pfp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function findByUserIdAndSpaceId(userId, spaceId) {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        space_id,
        legal_name,
        date_of_birth,
        country_of_residence,
        nationality,
        tax_id_last4,
        occupation,
        source_of_funds,
        eligibility_status,
        eligibility_reason,
        reviewed_at,
        created_at,
        updated_at
      FROM personal_financial_profiles
      WHERE user_id = $1
        AND space_id = $2
      LIMIT 1
    `,
    [userId, spaceId]
  );

  return result.rows[0] || null;
}

async function upsertProfile({
  userId,
  spaceId,
  legalName,
  dateOfBirth,
  countryOfResidence,
  nationality,
  taxIdLast4,
  occupation,
  sourceOfFunds,
}) {
  const existing = await findByUserIdAndSpaceId(userId, spaceId);

  if (!existing) {
    const result = await pool.query(
      `
        INSERT INTO personal_financial_profiles (
          id,
          user_id,
          space_id,
          legal_name,
          date_of_birth,
          country_of_residence,
          nationality,
          tax_id_last4,
          occupation,
          source_of_funds
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `,
      [
        buildFinancialProfileId(),
        userId,
        spaceId,
        legalName,
        dateOfBirth,
        countryOfResidence,
        nationality,
        taxIdLast4,
        occupation,
        sourceOfFunds,
      ]
    );

    return result.rows[0];
  }

  const result = await pool.query(
    `
      UPDATE personal_financial_profiles
      SET
        legal_name = $3,
        date_of_birth = $4,
        country_of_residence = $5,
        nationality = $6,
        tax_id_last4 = $7,
        occupation = $8,
        source_of_funds = $9,
        updated_at = NOW()
      WHERE user_id = $1
        AND space_id = $2
      RETURNING *
    `,
    [
      userId,
      spaceId,
      legalName,
      dateOfBirth,
      countryOfResidence,
      nationality,
      taxIdLast4,
      occupation,
      sourceOfFunds,
    ]
  );

  return result.rows[0];
}

async function updateEligibility({
  userId,
  spaceId,
  eligibilityStatus,
  eligibilityReason,
}) {
  const result = await pool.query(
    `
      UPDATE personal_financial_profiles
      SET
        eligibility_status = $3,
        eligibility_reason = $4,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1
        AND space_id = $2
      RETURNING *
    `,
    [userId, spaceId, eligibilityStatus, eligibilityReason]
  );

  return result.rows[0] || null;
}

module.exports = {
  findByUserIdAndSpaceId,
  upsertProfile,
  updateEligibility,
};