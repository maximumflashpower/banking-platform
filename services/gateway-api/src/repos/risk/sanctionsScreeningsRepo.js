const riskDb = require('../../infrastructure/riskDb');

async function insertScreening(input) {
  const sql = `
    INSERT INTO sanctions_screenings (
      subject_type,
      subject_id,
      screening_scope,
      screening_status,
      screening_provider,
      provider_reference,
      subject_snapshot,
      matched_entities,
      reason_code,
      confidence_score,
      case_id,
      screening_version,
      created_by
    )
    VALUES (
      $1, $2, $3, $4,
      'internal_sanctions_foundation',
      $5, $6::jsonb, $7::jsonb, $8, $9, $10,
      'stage6c-foundation-v1',
      $11
    )
    RETURNING
      id,
      subject_type,
      subject_id,
      screening_scope,
      screening_status,
      provider_reference,
      reason_code,
      confidence_score,
      case_id,
      created_at
  `;

  const values = [
    input.subject_type,
    input.subject_id,
    input.screening_scope,
    input.screening_status,
    input.provider_reference || null,
    JSON.stringify(input.subject_snapshot || {}),
    JSON.stringify(input.matched_entities || []),
    input.reason_code,
    input.confidence_score,
    input.case_id || null,
    input.created_by || 'system'
  ];

  const { rows } = await riskDb.query(sql, values);
  return rows[0];
}

async function updateScreeningCaseId(screeningId, caseId) {
  const sql = `
    UPDATE sanctions_screenings
    SET case_id = $2
    WHERE id = $1
    RETURNING id, case_id
  `;
  const { rows } = await riskDb.query(sql, [screeningId, caseId]);
  return rows[0];
}

async function appendAuditEvent({
  entityType,
  entityId,
  eventType,
  actorType,
  actorId,
  payload
}) {
  const sql = `
    INSERT INTO risk_audit_immutable (
      entity_type,
      entity_id,
      event_type,
      actor_type,
      actor_id,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id, created_at
  `;

  const values = [
    entityType,
    entityId,
    eventType,
    actorType,
    actorId,
    JSON.stringify(payload || {})
  ];

  const { rows } = await riskDb.query(sql, values);
  return rows[0];
}

module.exports = {
  insertScreening,
  updateScreeningCaseId,
  appendAuditEvent
};