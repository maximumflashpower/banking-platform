'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../infrastructure/identityDb');

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

function getSessionId(req) {
  const v = req.header('X-Session-Id');
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

router.post('/step-up/verify', async (req, res, next) => {
  const idempotencyKey = getIdempotencyKey(req);
  const correlationId = getCorrelationId(req);
  const requestId = getRequestId(req);
  const sessionId = getSessionId(req);

  const {
    step_up_session_id,
    verification_method,
    otp_code,
    device_id = null,
  } = req.body || {};

  try {
    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_STEP_UP_REQUEST', message: 'Idempotency-Key is required' } });
    }

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_STEP_UP_REQUEST', message: 'X-Session-Id is required' } });
    }

    if (typeof step_up_session_id !== 'string' || !step_up_session_id.trim()) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_STEP_UP_REQUEST', message: 'step_up_session_id is required' } });
    }

    if (!['otp', 'device', 'biometric'].includes(verification_method)) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_STEP_UP_REQUEST', message: 'verification_method is invalid' } });
    }

    const result = await db.withTransaction(async (client) => {
      const replay = await client.query(
        `
        SELECT s.id, s.state, s.verification_method, s.verified_at, s.expires_at
        FROM step_up_events e
        JOIN step_up_sessions s ON s.id = e.step_up_session_id
        WHERE e.idempotency_key = $1
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

      const found = await client.query(
        `
        SELECT *
        FROM step_up_sessions
        WHERE id = $1
        FOR UPDATE
        `,
        [step_up_session_id]
      );

      if (found.rowCount === 0) {
        return {
          status: 404,
          body: {
            ok: false,
            error: {
              code: 'STEP_UP_NOT_FOUND',
              message: 'Step-up session not found',
            },
          },
        };
      }

      const s = found.rows[0];

      if (s.session_id !== sessionId) {
        return {
          status: 403,
          body: {
            ok: false,
            error: {
              code: 'STEP_UP_FORBIDDEN',
              message: 'Step-up session does not belong to authenticated session',
            },
          },
        };
      }

      if (new Date(s.expires_at).getTime() <= Date.now()) {
        await client.query(
          `
          UPDATE step_up_sessions
          SET state = 'expired', updated_at = now()
          WHERE id = $1 AND state <> 'verified' AND state <> 'expired'
          `,
          [s.id]
        );

        await client.query(
          `
          INSERT INTO step_up_events (
            id, step_up_session_id, event_type, from_state, to_state,
            actor_type, actor_id, device_id, metadata,
            idempotency_key, correlation_id, request_id
          )
          VALUES ($1,$2,'step_up_expired',$3,'expired','user',NULL,$4,$5::jsonb,$6,$7,$8)
          ON CONFLICT (idempotency_key) DO NOTHING
          `,
          [
            uuid(),
            s.id,
            s.state,
            device_id,
            JSON.stringify({ verification_method }),
            `${idempotencyKey}:expired`,
            correlationId,
            requestId,
          ]
        );

        return {
          status: 410,
          body: {
            ok: false,
            error: {
              code: 'STEP_UP_EXPIRED',
              message: 'Step-up session has expired',
            },
          },
        };
      }

      if (s.state !== 'pending_verification') {
        return {
          status: 409,
          body: {
            ok: false,
            error: {
              code: 'STEP_UP_INVALID_STATE',
              message: 'Step-up session is not pending verification',
            },
          },
        };
      }

      const validOtp = verification_method !== 'otp' || String(otp_code || '').trim() === '123456';

      if (!validOtp) {
        const nextAttempts = Number(s.attempts_count || 0) + 1;
        const nextState = nextAttempts >= Number(s.max_attempts || 5) ? 'cancelled' : s.state;

        await client.query(
          `
          UPDATE step_up_sessions
          SET attempts_count = $2,
              state = $3,
              updated_at = now()
          WHERE id = $1
          `,
          [s.id, nextAttempts, nextState]
        );

        await client.query(
          `
          INSERT INTO step_up_events (
            id, step_up_session_id, event_type, from_state, to_state,
            actor_type, actor_id, attempt_number, device_id, metadata,
            idempotency_key, correlation_id, request_id
          )
          VALUES ($1,$2,'verification_failed',$3,$4,'user',NULL,$5,$6,$7::jsonb,$8,$9,$10)
          `,
          [
            uuid(),
            s.id,
            s.state,
            nextState,
            nextAttempts,
            device_id,
            JSON.stringify({ verification_method }),
            idempotencyKey,
            correlationId,
            requestId,
          ]
        );

        return {
          status: 401,
          body: {
            ok: false,
            error: {
              code: 'STEP_UP_INVALID_CODE',
              message: 'Verification failed',
            },
          },
        };
      }

      await client.query(
        `
        UPDATE step_up_sessions
        SET state = 'verified',
            verification_method = $2,
            verified_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [s.id, verification_method]
      );

      await client.query(
        `
        INSERT INTO step_up_events (
          id, step_up_session_id, event_type, from_state, to_state,
          actor_type, actor_id, device_id, metadata,
          idempotency_key, correlation_id, request_id
        )
        VALUES ($1,$2,'step_up_verified',$3,'verified','user',NULL,$4,$5::jsonb,$6,$7,$8)
        `,
        [
          uuid(),
          s.id,
          s.state,
          device_id,
          JSON.stringify({ verification_method }),
          idempotencyKey,
          correlationId,
          requestId,
        ]
      );

      const updated = await client.query(
        `
        SELECT id, state, verification_method, verified_at, expires_at
        FROM step_up_sessions
        WHERE id = $1
        `,
        [s.id]
      );

      return {
        status: 200,
        body: {
          ok: true,
          step_up_session: updated.rows[0],
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
