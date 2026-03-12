const caseDb = require('../../infrastructure/caseDb');

async function createPotentialMatchCase({
  screeningId,
  subjectType,
  subjectId,
  reasonCode,
  providerReference,
  matchedEntities
}) {
  const sql = `
    INSERT INTO sanctions_screening_cases (
      screening_id,
      subject_type,
      subject_id,
      screening_status,
      queue_name,
      status,
      severity,
      reason_code,
      provider_reference,
      matched_entities
    )
    VALUES (
      $1, $2, $3,
      'potential_match',
      'sanctions-screening',
      'open',
      'medium',
      $4, $5, $6::jsonb
    )
    RETURNING
      id,
      screening_id,
      subject_type,
      subject_id,
      screening_status,
      status,
      severity,
      reason_code,
      created_at
  `;

  const values = [
    screeningId,
    subjectType,
    subjectId,
    reasonCode,
    providerReference || null,
    JSON.stringify(matchedEntities || [])
  ];

  const { rows } = await caseDb.query(sql, values);
  return rows[0];
}

module.exports = {
  createPotentialMatchCase
};