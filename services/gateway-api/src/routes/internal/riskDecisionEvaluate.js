const express = require('express');
const riskDb = require('../../infrastructure/riskDb');
const riskSignalsRepo = require('../../repos/risk/riskSignalsRepo');
const riskDecisionsRepo = require('../../repos/risk/riskDecisionsRepo');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deriveDecision(signals) {
  const counts = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const signal of signals) {
    if (counts[signal.severity] !== undefined) {
      counts[signal.severity] += 1;
    }
  }

  if (counts.critical >= 1) {
    return {
      decisionOutcome: 'review',
      riskScore: 90,
      recommendedActions: [
        { actionType: 'manual_review', actionPayload: { trigger: 'critical_signal' } }
      ]
    };
  }

  if (counts.high >= 2) {
    return {
      decisionOutcome: 'review',
      riskScore: 75,
      recommendedActions: [
        { actionType: 'manual_review', actionPayload: { trigger: 'multiple_high_signals' } }
      ]
    };
  }

  if (counts.high === 1 || counts.medium >= 2) {
    return {
      decisionOutcome: 'observe',
      riskScore: 45,
      recommendedActions: [
        { actionType: 'enhanced_monitoring', actionPayload: { trigger: 'elevated_signal_pattern' } }
      ]
    };
  }

  if (counts.medium === 1 || counts.low >= 1) {
    return {
      decisionOutcome: 'observe',
      riskScore: 20,
      recommendedActions: [
        { actionType: 'collect_more_signals', actionPayload: { trigger: 'limited_signal_evidence' } }
      ]
    };
  }

  return {
    decisionOutcome: 'allow',
    riskScore: 0,
    recommendedActions: []
  };
}

function buildDecisionEvent(decision, actionRows) {
  return {
    event_id: decision.id,
    event_type: 'risk.decision.made.v1',
    occurred_at: decision.createdAt,
    decision_id: decision.id,
    subject_type: decision.subjectType,
    subject_id: decision.subjectId,
    space_id: decision.spaceId,
    decision_outcome: decision.decisionOutcome,
    reason_code: decision.reasonCode,
    risk_score: decision.riskScore,
    recommended_actions: actionRows.map((row) => row.action_type)
  };
}

router.post('/decision/evaluate', async (req, res) => {
  const {
    subject_type: subjectType,
    subject_id: subjectId,
    space_id: spaceId,
    reason_code: reasonCode,
    decided_by: decidedBy,
    signal_ids: signalIds,
    evaluation_context: evaluationContext
  } = req.body || {};

  if (!isNonEmptyString(subjectType)) {
    return res.status(400).json({ error: 'subject_type is required' });
  }

  if (!isNonEmptyString(subjectId)) {
    return res.status(400).json({ error: 'subject_id is required' });
  }

  if (!isNonEmptyString(reasonCode)) {
    return res.status(400).json({ error: 'reason_code is required' });
  }

  if (!isNonEmptyString(decidedBy)) {
    return res.status(400).json({ error: 'decided_by is required' });
  }

  if (evaluationContext !== undefined && !isObject(evaluationContext)) {
    return res.status(400).json({ error: 'evaluation_context must be an object' });
  }

  try {
    const signals = Array.isArray(signalIds) && signalIds.length > 0
      ? await riskSignalsRepo.findSignalsByIds(riskDb, signalIds)
      : await riskSignalsRepo.findRecentSignalsForSubject(riskDb, {
          subjectType: subjectType.trim(),
          subjectId: subjectId.trim(),
          limit: 25
        });

    const relevantSignals = signals.filter(
      (signal) =>
        signal.subjectType === subjectType.trim() &&
        signal.subjectId === subjectId.trim()
    );

    const derived = deriveDecision(relevantSignals);

    const result = await riskDb.withTransaction(async (tx) => {
      const decision = await riskDecisionsRepo.insertDecision(tx, {
        subjectType: subjectType.trim(),
        subjectId: subjectId.trim(),
        spaceId: isNonEmptyString(spaceId) ? spaceId.trim() : null,
        decisionOutcome: derived.decisionOutcome,
        reasonCode: reasonCode.trim(),
        riskScore: derived.riskScore,
        signalCount: relevantSignals.length,
        evaluationContext: evaluationContext || {},
        decidedBy: decidedBy.trim()
      });

      await riskDecisionsRepo.linkDecisionSignals(tx, {
        decisionId: decision.id,
        signalIds: relevantSignals.map((signal) => signal.id)
      });

      const actionRows = await riskDecisionsRepo.insertRecommendedActions(tx, {
        decisionId: decision.id,
        actions: derived.recommendedActions
      });

      await riskDecisionsRepo.insertAuditRecord(tx, {
        entityType: 'risk_decision',
        entityId: decision.id,
        eventType: 'risk.decision.made',
        actorType: 'system',
        actorId: decidedBy.trim(),
        payload: {
          subject_type: decision.subjectType,
          subject_id: decision.subjectId,
          decision_outcome: decision.decisionOutcome,
          reason_code: decision.reasonCode,
          signal_count: decision.signalCount
        }
      });

      return { decision, actionRows };
    });

    return res.status(201).json({
      decision_id: result.decision.id,
      decision_outcome: result.decision.decisionOutcome,
      reason_code: result.decision.reasonCode,
      risk_score: result.decision.riskScore,
      recommended_actions: result.actionRows.map((row) => row.action_type),
      event: buildDecisionEvent(result.decision, result.actionRows)
    });
  } catch (error) {
    console.error('[riskDecisionEvaluate] failed', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
