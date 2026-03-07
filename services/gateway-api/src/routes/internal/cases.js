'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../../infrastructure/caseDb');

const router = express.Router();

const SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function getIdempotencyKey(req) {
  const v = req.header('Idempotency-Key');
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function getCorrelationId(req) {
  const v = req.header('X-Correlation-Id');
  if (typeof v === 'string' && v.trim()) return v.trim();
  return uuid();
}

function getRequestId(req) {
  const v = req.header('X-Request-Id');
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function isAllowed(value, allowed) {
  return typeof value === 'string' && allowed.includes(value);
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

router.post('/', async (req, res, next) => {
  const idempotencyKey = getIdempotencyKey(req);
  const correlationId = getCorrelationId(req);
  const requestId = getRequestId(req);

  const {
    domain,
    origin,
    priority = 'normal',
    severity = 'medium',
    title,
    summary,
    business_id = null,
    user_id = null,
    source_system = null,
    source_reference = null,
    external_object_type = null,
    external_object_id = null,
    dedupe_key = null,
  } = req.body || {};

  try {
    if (!idempotencyKey) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_REQUEST', message: 'Idempotency-Key is required' }
      });
    }

    if (!isAllowed(domain, ['aml_risk', 'support', 'disputes', 'recovery', 'legal_hold', 'operations'])) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_REQUEST', message: 'domain is invalid' }
      });
    }

    if (!isAllowed(origin, [
      'risk_signal',
      'payment_rejection',
      'fraud_detection',
      'user_report',
      'support_ticket',
      'manual',
      'reconciliation_mismatch'
    ])) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_REQUEST', message: 'origin is invalid' }
      });
    }

    if (!isAllowed(priority, ['low', 'normal', 'high', 'urgent'])) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_REQUEST', message: 'priority is invalid' }
      });
    }

    if (!isAllowed(severity, ['low', 'medium', 'high', 'critical'])) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_REQUEST', message: 'severity is invalid' }
      });
    }

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_REQUEST', message: 'title is required' }
      });
    }

    if (typeof summary !== 'string' || !summary.trim()) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_REQUEST', message: 'summary is required' }
      });
    }

    const result = await db.withTransaction(async (client) => {
      const replay = await client.query(
        `
        SELECT id, case_number, domain, origin, state
        FROM cases
        WHERE idempotency_key = $1
        LIMIT 1
        `,
        [idempotencyKey]
      );

      if (replay.rowCount > 0) {
        return {
          status: 200,
          body: {
            ok: true,
            case: replay.rows[0],
            idempotent_replay: true,
          },
        };
      }

      const normalizedDedupeKey = normalizeNullableString(dedupe_key);
      if (normalizedDedupeKey) {
        const existing = await client.query(
          `
          SELECT id, case_number, domain, origin, state
          FROM cases
          WHERE dedupe_key = $1
          LIMIT 1
          `,
          [normalizedDedupeKey]
        );

        if (existing.rowCount > 0) {
          return {
            status: 200,
            body: {
              ok: true,
              case: existing.rows[0],
              dedupe_hit: true,
            },
          };
        }
      }

      const caseId = uuid();
      const timelineId = uuid();

      await client.query(
        `
        INSERT INTO cases (
          id,
          domain,
          origin,
          state,
          priority,
          severity,
          title,
          summary,
          business_id,
          user_id,
          source_system,
          source_reference,
          external_object_type,
          external_object_id,
          dedupe_key,
          idempotency_key,
          correlation_id,
          request_id,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,'open',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )
        `,
        [
          caseId,
          domain,
          origin,
          priority,
          severity,
          title.trim(),
          summary.trim(),
          business_id,
          user_id,
          normalizeNullableString(source_system),
          normalizeNullableString(source_reference),
          normalizeNullableString(external_object_type),
          normalizeNullableString(external_object_id),
          normalizedDedupeKey,
          idempotencyKey,
          correlationId,
          requestId,
          SYSTEM_ACTOR_UUID,
          SYSTEM_ACTOR_UUID,
        ]
      );

      await client.query(
        `
        INSERT INTO case_timeline (
          id,
          case_id,
          event_type,
          to_state,
          actor_type,
          actor_id,
          visible_to_customer,
          entry_text,
          metadata,
          idempotency_key,
          correlation_id,
          request_id
        )
        VALUES (
          $1,$2,'case_created','open','system',NULL,false,$3,$4::jsonb,$5,$6,$7
        )
        `,
        [
          timelineId,
          caseId,
          `Case created: ${title.trim()}`,
          JSON.stringify({
            domain,
            origin,
            priority,
            severity,
            external_object_type: normalizeNullableString(external_object_type),
            external_object_id: normalizeNullableString(external_object_id),
          }),
          `${idempotencyKey}:timeline:case_created`,
          correlationId,
          requestId,
        ]
      );

      const created = await client.query(
        `
        SELECT
          id,
          case_number,
          domain,
          origin,
          state,
          priority,
          severity,
          title,
          summary,
          business_id,
          user_id,
          source_system,
          source_reference,
          external_object_type,
          external_object_id,
          opened_at,
          created_at,
          updated_at
        FROM cases
        WHERE id = $1
        `,
        [caseId]
      );

      return {
        status: 201,
        body: {
          ok: true,
          case: created.rows[0],
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;