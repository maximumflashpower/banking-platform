function mapDecisionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    spaceId: row.space_id,
    decisionOutcome: row.decision_outcome,
    reasonCode: row.reason_code,
    riskScore: row.risk_score,
    signalCount: row.signal_count,
    evaluationContext: row.evaluation_context,
    decidedBy: row.decided_by,
    createdAt: row.created_at
  };
}

async function insertDecision(db, input) {
  const { rows } = await db.query(
    `
      INSERT INTO public.risk_decisions (
        subject_type,
        subject_id,
        space_id,
        decision_outcome,
        reason_code,
        risk_score,
        signal_count,
        evaluation_context,
        decided_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      RETURNING *
    `,
    [
      input.subjectType,
      input.subjectId,
      input.spaceId || null,
      input.decisionOutcome,
      input.reasonCode,
      input.riskScore ?? null,
      input.signalCount ?? 0,
      JSON.stringify(input.evaluationContext || {}),
      input.decidedBy
    ]
  );

  return mapDecisionRow(rows[0]);
}

async function linkDecisionSignals(db, { decisionId, signalIds }) {
  if (!Array.isArray(signalIds) || signalIds.length === 0) {
    return;
  }

  for (const signalId of signalIds) {
    await db.query(
      `
        INSERT INTO public.risk_decision_signal_links (
          decision_id,
          signal_id
        )
        VALUES ($1,$2)
        ON CONFLICT (decision_id, signal_id) DO NOTHING
      `,
      [decisionId, signalId]
    );
  }
}

async function insertRecommendedActions(db, { decisionId, actions }) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return [];
  }

  const inserted = [];
  for (const action of actions) {
    const { rows } = await db.query(
      `
        INSERT INTO public.risk_actions (
          decision_id,
          action_type,
          action_payload
        )
        VALUES ($1,$2,$3::jsonb)
        RETURNING id, decision_id, action_type, action_status, action_payload, created_at
      `,
      [
        decisionId,
        action.actionType,
        JSON.stringify(action.actionPayload || {})
      ]
    );
    inserted.push(rows[0]);
  }

  return inserted;
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
  insertDecision,
  linkDecisionSignals,
  insertRecommendedActions,
  insertAuditRecord
};
