const express = require('express');
const riskDb = require('../../infrastructure/riskDb');
const riskSignalsRepo = require('../../repos/risk/riskSignalsRepo');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function buildRiskEvent(signal) {
  return {
    event_id: signal.id,
    event_type: 'risk.signal.ingested.v1',
    occurred_at: signal.createdAt,
    signal_id: signal.id,
    signal_type: signal.signalType,
    subject_type: signal.subjectType,
    subject_id: signal.subjectId,
    space_id: signal.spaceId,
    severity: signal.severity,
    source_system: signal.sourceSystem
  };
}

router.post('/signals/ingest', async (req, res) => {
  const {
    signal_type: signalType,
    subject_type: subjectType,
    subject_id: subjectId,
    space_id: spaceId,
    source_system: sourceSystem,
    severity,
    observed_at: observedAt,
    payload,
    idempotency_key: idempotencyKey
  } = req.body || {};

  if (!isNonEmptyString(signalType)) {
    return res.status(400).json({ error: 'signal_type is required' });
  }

  if (!isNonEmptyString(subjectType)) {
    return res.status(400).json({ error: 'subject_type is required' });
  }

  if (!isNonEmptyString(subjectId)) {
    return res.status(400).json({ error: 'subject_id is required' });
  }

  if (!isNonEmptyString(sourceSystem)) {
    return res.status(400).json({ error: 'source_system is required' });
  }

  if (!isNonEmptyString(severity)) {
    return res.status(400).json({ error: 'severity is required' });
  }

  if (!isNonEmptyString(idempotencyKey)) {
    return res.status(400).json({ error: 'idempotency_key is required' });
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'payload must be an object' });
  }

  const normalizedObservedAt = normalizeIsoDate(observedAt);
  if (!normalizedObservedAt) {
    return res.status(400).json({ error: 'observed_at must be a valid ISO-8601 datetime' });
  }

  try {
    const existing = await riskSignalsRepo.findSignalByIdempotencyKey(
      riskDb,
      idempotencyKey.trim()
    );

    if (existing) {
      return res.status(200).json({
        signal_id: existing.id,
        status: 'already_ingested'
      });
    }

    const signal = await riskDb.withTransaction(async (tx) => {
      const created = await riskSignalsRepo.insertSignal(tx, {
        signalType: signalType.trim(),
        subjectType: subjectType.trim(),
        subjectId: subjectId.trim(),
        spaceId: isNonEmptyString(spaceId) ? spaceId.trim() : null,
        sourceSystem: sourceSystem.trim(),
        severity: severity.trim(),
        payload,
        observedAt: normalizedObservedAt,
        ingestIdempotencyKey: idempotencyKey.trim()
      });

      await riskSignalsRepo.insertAuditRecord(tx, {
        entityType: 'risk_signal',
        entityId: created.id,
        eventType: 'risk.signal.ingested',
        actorType: 'system',
        actorId: sourceSystem.trim(),
        payload: {
          signal_type: created.signalType,
          subject_type: created.subjectType,
          subject_id: created.subjectId,
          severity: created.severity
        }
      });

      return created;
    });

    return res.status(201).json({
      signal_id: signal.id,
      status: 'ingested',
      event: buildRiskEvent(signal)
    });
  } catch (error) {
    console.error('[riskSignalsIngest] failed', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
