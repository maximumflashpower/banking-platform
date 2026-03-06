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

function isAllowed(value, allowed) {
  return typeof value === 'string' && allowed.includes(value);
}

router.post('/:id/assign', async (req, res, next) => {
  const caseId = req.params.id;
  const idempotencyKey = getIdempotencyKey(req);
  const correlationId = getCorrelationId(req);
  const requestId = getRequestId(req);

  const {
    assignee_type,
    assignee_id,
    assigned_reason = null,
  } = req.body || {};

  try {
    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_ASSIGN_REQUEST', message: 'Idempotency-Key is required' } });
    }

    if (!isAllowed(assignee_type, ['user', 'queue', 'team'])) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_ASSIGN_REQUEST', message: 'assignee_type is invalid' } });
    }

    if (typeof assignee_id !== 'string' || !assignee_id.trim()) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_ASSIGN_REQUEST', message: 'assignee_id is required' } });
    }

    const result = await db.withTransaction(async (client) => {
      const replay = await client.query(
        `
        SELECT c.id, c.case_number, c.state, c.current_assignment_id
        FROM case_assignments a
        JOIN cases c ON c.id = a.case_id
        WHERE a.idempotency_key = $1
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

      const found = await client.query(
        `
        SELECT id, case_number, state, current_assignment_id
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

      if (currentCase.state === 'closed') {
        return {
          status: 409,
          body: {
            ok: false,
            error: {
              code: 'CASE_CLOSED',
              message: 'Closed cases cannot be reassigned',
            },
          },
        };
      }

      await client.query(
        `
        UPDATE case_assignments
        SET active = false,
            unassigned_at = now()
        WHERE case_id = $1
          AND active = true
        `,
        [caseId]
      );

      const assignmentId = uuid();

      await client.query(
        `
        INSERT INTO case_assignments (
          id,
          case_id,
          assignee_type,
          assignee_id,
          assigned_by,
          assigned_reason,
          active,
          assigned_at,
          idempotency_key,
          correlation_id,
          request_id,
          created_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,true,now(),$7,$8,$9,now()
        )
        `,
        [
          assignmentId,
          caseId,
          assignee_type,
          assignee_id.trim(),
          'system',
          assigned_reason,
          idempotencyKey,
          correlationId,
          requestId,
        ]
      );

      await client.query(
        `
        UPDATE cases
        SET current_assignment_id = $2,
            updated_by = 'system',
            updated_at = now()
        WHERE id = $1
        `,
        [caseId, assignmentId]
      );

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
          $1,$2,'case_assigned','system',NULL,false,$3,$4::jsonb,$5,$6,$7,now()
        )
        `,
        [
          uuid(),
          caseId,
          `Case assigned to ${assignee_type}:${assignee_id.trim()}`,
          JSON.stringify({
            assignee_type,
            assignee_id: assignee_id.trim(),
            assigned_reason,
          }),
          `${idempotencyKey}:timeline:case_assigned`,
          correlationId,
          requestId,
        ]
      );

      const updated = await client.query(
        `
        SELECT id, case_number, state, current_assignment_id
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
          assignment: {
            id: assignmentId,
            assignee_type,
            assignee_id: assignee_id.trim(),
            active: true,
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
