function mapSignalRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    signalType: row.signal_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    spaceId: row.space_id,
    sourceSystem: row.source_system,
    severity: row.severity,
    payload: row.payload,
    observedAt: row.observed_at,
    ingestIdempotencyKey: row.ingest_idempotency_key,
    createdAt: row.created_at
  };
}

async function findSignalByIdempotencyKey(db, ingestIdempotencyKey) {
  const { rows } = await db.query(
    `
      SELECT *
      FROM public.risk_signals
      WHERE ingest_idempotency_key = $1
      LIMIT 1
    `,
    [ingestIdempotencyKey]
  );

  return mapSignalRow(rows[0]);
}

async function insertSignal(db, input) {
  const { rows } = await db.query(
    `
      INSERT INTO public.risk_signals (
        signal_type,
        subject_type,
        subject_id,
        space_id,
        source_system,
        severity,
        payload,
        observed_at,
        ingest_idempotency_key
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      RETURNING *
    `,
    [
      input.signalType,
      input.subjectType,
      input.subjectId,
      input.spaceId || null,
      input.sourceSystem,
      input.severity,
      JSON.stringify(input.payload || {}),
      input.observedAt,
      input.ingestIdempotencyKey
    ]
  );

  return mapSignalRow(rows[0]);
}

async function findSignalsByIds(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const { rows } = await db.query(
    `
      SELECT *
      FROM public.risk_signals
      WHERE id = ANY($1::uuid[])
      ORDER BY created_at ASC
    `,
    [ids]
  );

  return rows.map(mapSignalRow);
}

async function findRecentSignalsForSubject(db, { subjectType, subjectId, limit = 25 }) {
  const { rows } = await db.query(
    `
      SELECT *
      FROM public.risk_signals
      WHERE subject_type = $1
        AND subject_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [subjectType, subjectId, limit]
  );

  return rows.map(mapSignalRow);
}

async function insertAuditRecord(db, record) {
  await db.query(
    `
      INSERT INTO public.risk_audit_immutable (
        entity_type,
        entity_id,
        event_type,
        actor_type,
        actor_id,
        payload
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    `,
    [
      record.entityType,
      record.entityId,
      record.eventType,
      record.actorType,
      record.actorId,
      JSON.stringify(record.payload || {})
    ]
  );
}

module.exports = {
  findSignalByIdempotencyKey,
  insertSignal,
  findSignalsByIds,
  findRecentSignalsForSubject,
  insertAuditRecord
};
