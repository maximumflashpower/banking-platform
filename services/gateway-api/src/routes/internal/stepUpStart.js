'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../../infrastructure/identityDb');

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

router.post('/step-up/start', async (req, res, next) => {
  const idempotencyKey = getIdempotencyKey(req);
  const correlationId = getCorrelationId(req);
  const requestId = getRequestId(req);

  const {
    session_id,
    user_id,
    business_id = null,
    purpose,
    target_type,
    target_id,
    verification_method = 'otp',
    required_level = 'standard',
    ttl_seconds = 300,
  } = req.body || {};

  try {
    if (!idempotencyKey) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'Idempotency-Key is required',
        },
      });
    }

    if (typeof session_id !== 'string' || !session_id.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'session_id is required',
        },
      });
    }

    if (typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'user_id is required',
        },
      });
    }

    if (typeof purpose !== 'string' || !purpose.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'purpose is required',
        },
      });
    }

    if (typeof target_type !== 'string' || !target_type.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'target_type is required',
        },
      });
    }

    if (typeof target_id !== 'string' || !target_id.trim()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'target_id is required',
        },
      });
    }

    if (!isAllowed(verification_method, ['otp', 'device', 'biometric'])) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'verification_method is invalid',
        },
      });
    }

    if (!isAllowed(required_level, ['standard', 'high'])) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'required_level is invalid',
        },
      });
    }

    const ttl = Number(ttl_seconds);
    if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 3600) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STEP_UP_START_REQUEST',
          message: 'ttl_seconds must be between 1 and 3600',
        },
      });
    }

    const result = await db.withTransaction(async (client) => {
      const replay = await client.query(
        `
        SELECT id, session_id, user_id, purpose, target_type, target_id, state, verification_method, expires_at
        FROM step_up_sessions
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
            step_up_session: replay.rows[0],
            idempotent_replay: true,
          },
        };
      }

      const sessionExists = await client.query(
        `
        SELECT id, user_id
        FROM sessions
        WHERE id = $1
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1
        `,
        [session_id.trim()]
      );

      if (sessionExists.rowCount === 0) {
        return {
          status: 404,
          body: {
            ok: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found or expired',
            },
          },
        };
      }

      if (sessionExists.rows[0].user_id !== user_id.trim()) {
        return {
          status: 409,
          body: {
            ok: false,
            error: {
              code: 'STEP_UP_SESSION_USER_MISMATCH',
              message: 'session_id does not belong to user_id',
            },
          },
        };
      }

      const active = await client.query(
        `
        SELECT id, session_id, user_id, purpose, target_type, target_id, state, verification_method, expires_at
        FROM step_up_sessions
        WHERE session_id = $1
          AND purpose = $2
          AND target_type = $3
          AND target_id = $4
          AND state IN ('created', 'pending_verification')
        LIMIT 1
        `,
        [
          session_id.trim(),
          purpose.trim(),
          target_type.trim(),
          target_id.trim(),
        ]
      );

      if (active.rowCount > 0) {
        return {
          status: 200,
          body: {
            ok: true,
            step_up_session: active.rows[0],
            active_reuse: true,
          },
        };
      }

      const stepUpId = uuid();
      const challengeReference = `challenge-${uuid()}`;

      await client.query(
        `
        INSERT INTO step_up_sessions (
          id,
          session_id,
          user_id,
          business_id,
          purpose,
          target_type,
          target_id,
          state,
          verification_method,
          required_level,
          challenge_reference,
          attempts_count,
          max_attempts,
          requested_at,
          expires_at,
          idempotency_key,
          correlation_id,
          request_id,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,'pending_verification',$8,$9,$10,0,5,now(),now() + ($11::text || ' seconds')::interval,$12,$13,$14,'system','system'
        )
        `,
        [
          stepUpId,
          session_id.trim(),
          user_id.trim(),
          business_id,
          purpose.trim(),
          target_type.trim(),
          target_id.trim(),
          verification_method,
          required_level,
          challengeReference,
          String(ttl),
          idempotencyKey,
          correlationId,
          requestId,
        ]
      );

      await client.query(
        `
        INSERT INTO step_up_events (
          id,
          step_up_session_id,
          event_type,
          from_state,
          to_state,
          actor_type,
          actor_id,
          metadata,
          idempotency_key,
          correlation_id,
          request_id,
          created_at
        )
        VALUES (
          $1,$2,'step_up_created',NULL,'pending_verification','system',NULL,$3::jsonb,$4,$5,$6,now()
        )
        `,
        [
          uuid(),
          stepUpId,
          JSON.stringify({
            purpose: purpose.trim(),
            target_type: target_type.trim(),
            target_id: target_id.trim(),
            verification_method,
            required_level,
          }),
          `${idempotencyKey}:event:step_up_created`,
          correlationId,
          requestId,
        ]
      );

      await client.query(
        `
        INSERT INTO step_up_events (
          id,
          step_up_session_id,
          event_type,
          from_state,
          to_state,
          actor_type,
          actor_id,
          metadata,
          idempotency_key,
          correlation_id,
          request_id,
          created_at
        )
        VALUES (
          $1,$2,'verification_requested','created','pending_verification','system',NULL,$3::jsonb,$4,$5,$6,now()
        )
        `,
        [
          uuid(),
          stepUpId,
          JSON.stringify({
            challenge_reference: challengeReference,
            verification_method,
          }),
          `${idempotencyKey}:event:verification_requested`,
          correlationId,
          requestId,
        ]
      );

      const created = await client.query(
        `
        SELECT id, session_id, user_id, purpose, target_type, target_id, state, verification_method, expires_at, challenge_reference
        FROM step_up_sessions
        WHERE id = $1
        `,
        [stepUpId]
      );

      return {
        status: 201,
        body: {
          ok: true,
          step_up_session: created.rows[0],
          verification: {
            method: verification_method,
            challenge_reference: challengeReference,
            demo_otp_code: verification_method === 'otp' ? '123456' : null,
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
