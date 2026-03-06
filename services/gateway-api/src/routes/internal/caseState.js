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

function canTransition(fromState, toState) {
  const allowed = {
    open: ['in_review', 'escalated'],
    in_review: ['escalated', 'resolved'],
    escalated: ['in_review', 'resolved'],
    resolved: ['closed'],
    closed: [],
  };

  return Array.isArray(allowed[fromState]) && allowed[fromState].includes(toState);
}

router.post('/:id/state', async (req, res, next) => {
  const caseId = req.params.id;
  const idempotencyKey = getIdempotencyKey(req);
  const correlationId = getCorrelationId(req);
  const requestId = getRequestId(req);

  const {
    to_state,
    reason = null,
    resolution_code = null,
    closure_reason = null,
  } = req.body || {};

  try {
    if (!idempotencyKey) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_STATE_REQUEST', message: 'Idempotency-Key is required' },
      });
    }

    if (!['open', 'in_review', 'escalated', 'resolved', 'closed'].includes(to_state)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CASE_STATE_REQUEST', message: 'to_state is invalid' },
      });
    }

    const result = await db.withTransaction(async (client) => {
      const found = await client.query(
        `
        SELECT id, case_number, state, current_assignment_id, resolution_code, closure_reason, resolved_at, closed_at
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
      const fromState = currentCase.state;

      if (!canTransition(fromState, to_state)) {
        return {
          status: 409,
          body: {
            ok: false,
            error: {
              code: 'INVALID_CASE_TRANSITION',
              message: `Invalid transition from ${fromState} to ${to_state}`,
            },
          },
        };
      }

      if ((to_state === 'in_review' || to_state === 'escalated') && !currentCase.current_assignment_id) {
        return {
          status: 409,
          body: {
            ok: false,
            error: {
              code: 'CASE_ASSIGNMENT_REQUIRED',
              message: 'Assignment is required before moving to in_review or escalated',
            },
          },
        };
      }

      if (to_state === 'resolved' && (!resolution_code || !String(resolution_code).trim())) {
        return {
          status: 400,
          body: {
            ok: false,
            error: {
              code: 'CASE_RESOLUTION_REQUIRED',
              message: 'resolution_code is required when moving to resolved',
            },
          },
        };
      }

      if (to_state === 'closed' && (!closure_reason || !String(closure_reason).trim())) {
        return {
          status: 400,
          body: {
            ok: false,
            error: {
              code: 'CASE_CLOSURE_REQUIRED',
              message: 'closure_reason is required when moving to closed',
            },
          },
        };
      }

      const normalizedResolutionCode =
        to_state === 'resolved' ? String(resolution_code).trim() : currentCase.resolution_code;

      const normalizedClosureReason =
        to_state === 'closed' ? String(closure_reason).trim() : currentCase.closure_reason;

      await client.query(
        `
        UPDATE cases
        SET state = $2::varchar,
            resolved_at = CASE
              WHEN $2::varchar = 'resolved' THEN now()
              ELSE resolved_at
            END,
            closed_at = CASE
              WHEN $2::varchar = 'closed' THEN now()
              ELSE closed_at
            END,
            resolution_code = $3::varchar,
            closure_reason = $4::varchar,
            correlation_id = $5::varchar,
            request_id = $6::varchar,
            updated_by = 'system',
            updated_at = now()
        WHERE id = $1
        `,
        [
          caseId,
          to_state,
          normalizedResolutionCode,
          normalizedClosureReason,
          correlationId,
          requestId,
        ]
      );

      await client.query(
        `
        INSERT INTO case_timeline (
          id,
          case_id,
          event_type,
          from_state,
          to_state,
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
          $1,$2,'case_status_changed',$3,$4,'system',NULL,false,$5,$6::jsonb,$7,$8,$9,now()
        )
        `,
        [
          uuid(),
          caseId,
          fromState,
          to_state,
          reason || `State changed from ${fromState} to ${to_state}`,
          JSON.stringify({
            reason,
            resolution_code: normalizedResolutionCode,
            closure_reason: normalizedClosureReason,
          }),
          `${idempotencyKey}:timeline:case_status_changed`,
          correlationId,
          requestId,
        ]
      );

      if (to_state === 'closed') {
        await client.query(
          `
          INSERT INTO case_timeline (
            id,
            case_id,
            event_type,
            from_state,
            to_state,
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
            $1,$2,'case_closed',$3,$4,'system',NULL,false,$5,$6::jsonb,$7,$8,$9,now()
          )
          `,
          [
            uuid(),
            caseId,
            fromState,
            to_state,
            `Case closed: ${normalizedClosureReason}`,
            JSON.stringify({ closure_reason: normalizedClosureReason }),
            `${idempotencyKey}:timeline:case_closed`,
            correlationId,
            requestId,
          ]
        );
      }

      const updated = await client.query(
        `
        SELECT id, case_number, state, resolution_code, closure_reason, resolved_at, closed_at
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
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
