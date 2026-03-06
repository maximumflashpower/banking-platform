'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../../infrastructure/caseDb');

const router = express.Router();

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

router.post('/:id/evidence', async (req, res, next) => {
  const caseId = req.params.id;
  const idempotencyKey = getIdempotencyKey(req);
  const correlationId = getCorrelationId(req);
  const requestId = getRequestId(req);

  const {
    evidence_type,
    reference,
    description = null,
    visible_to_customer = false,
  } = req.body || {};

  try {
    if (!idempotencyKey) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_EVIDENCE_REQUEST',
          message: 'Idempotency-Key is required',
        },
      });
    }

    if (typeof evidence_type !== 'string' || !evidence_type.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_EVIDENCE_REQUEST',
          message: 'evidence_type is required',
        },
      });
    }

    if (typeof reference !== 'string' || !reference.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_EVIDENCE_REQUEST',
          message: 'reference is required',
        },
      });
    }

    const result = await db.withTransaction(async (client) => {
      const found = await client.query(
        `
        SELECT id, case_number, state
        FROM cases
        WHERE id = $1
        FOR UPDATE
        `,
        [caseId]
      );

      if (found.rowCount === 0) {
        return {
          status: 404,
          body: {
            ok: false,
            error: {
              code: 'CASE_NOT_FOUND',
              message: 'Case not found',
            },
          },
        };
      }

      const currentCase = found.rows[0];

      const replay = await client.query(
        `
        SELECT id, case_id, event_type, entry_text, metadata, created_at
        FROM case_timeline
        WHERE case_id = $1
          AND event_type = 'evidence_added'
          AND idempotency_key = $2
        LIMIT 1
        `,
        [caseId, `${idempotencyKey}:timeline:evidence_added`]
      );

      if (replay.rowCount > 0) {
        return {
          status: 200,
          body: {
            ok: true,
            case: currentCase,
            evidence: {
              evidence_type,
              reference,
              description,
              visible_to_customer: Boolean(visible_to_customer),
            },
            idempotent_replay: true,
          },
        };
      }

      await client.query(
        `
        INSERT INTO case_timeline (
          id,
          case_id,
          event_type,
          actor_type,
          actor_id,
          visible_to_customer,
          entry_text,
          metadata,
          idempotency_key,
          correlation_id,
          request_id,
          created_at
        )
        VALUES (
          $1,$2,'evidence_added','system',NULL,$3,$4,$5::jsonb,$6,$7,$8,now()
        )
        `,
        [
          uuid(),
          caseId,
          Boolean(visible_to_customer),
          description
            ? `Evidence added: ${description}`
            : `Evidence added: ${evidence_type.trim()}`,
          JSON.stringify({
            evidence_type: evidence_type.trim(),
            reference: reference.trim(),
            description,
            visible_to_customer: Boolean(visible_to_customer),
          }),
          `${idempotencyKey}:timeline:evidence_added`,
          correlationId,
          requestId,
        ]
      );

      const updated = await client.query(
        `
        SELECT id, case_number, state
        FROM cases
        WHERE id = $1
        `,
        [caseId]
      );

      return {
        status: 200,
        body: {
          ok: true,
          case: updated.rows[0],
          evidence: {
            evidence_type: evidence_type.trim(),
            reference: reference.trim(),
            description,
            visible_to_customer: Boolean(visible_to_customer),
          },
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
