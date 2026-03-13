'use strict';

function createStepUpRepo({ identityDb }) {
  if (!identityDb) {
    throw new Error('identityDb_required');
  }

  const hasQuery = typeof identityDb.query === 'function';
  const hasWithTransaction = typeof identityDb.withTransaction === 'function';

  if (!hasQuery && !hasWithTransaction) {
    throw new Error('identityDb_query_required');
  }

  async function runQuery(text, params) {
    if (hasQuery) {
      return identityDb.query(text, params);
    }

    return identityDb.withTransaction(async (client) => client.query(text, params));
  }

  async function withTransaction(work) {
    if (hasWithTransaction) {
      return identityDb.withTransaction(work);
    }

    throw new Error('identityDb_withTransaction_required');
  }

  async function findWebSessionForStepUp(webSessionId) {
    const { rows } = await runQuery(
      `
        SELECT
          session_id,
          session_request_id,
          user_id,
          device_id_web,
          active_space_id,
          status,
          expires_at,
          last_seen_at,
          invalidated_at,
          invalidated_reason,
          last_activity_at
        FROM web_sessions
        WHERE session_id = $1
        LIMIT 1
      `,
      [webSessionId]
    );

    return rows[0] || null;
  }

  async function findStepUpSessionById(stepUpSessionId) {
    const { rows } = await runQuery(
      `
        SELECT *
        FROM step_up_sessions
        WHERE id = $1
        LIMIT 1
      `,
      [stepUpSessionId]
    );

    return rows[0] || null;
  }

  async function findPendingStepUpForAction({ webSessionId, purpose, targetType, targetId }) {
    const { rows } = await runQuery(
      `
        SELECT *
        FROM step_up_sessions
        WHERE web_session_id = $1
          AND purpose = $2
          AND target_type = $3
          AND target_id = $4
          AND state = 'pending_verification'
        ORDER BY requested_at DESC, created_at DESC
        LIMIT 1
      `,
      [webSessionId, purpose, targetType, targetId]
    );

    return rows[0] || null;
  }

  async function appendStepUpEvent(client, {
    id,
    stepUpSessionId,
    eventType,
    fromState,
    toState,
    actorType,
    actorId,
    attemptNumber,
    deviceId,
    metadata,
    idempotencyKey,
    correlationId,
    requestId
  }) {
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
          attempt_number,
          device_id,
          metadata,
          idempotency_key,
          correlation_id,
          request_id,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, NOW()
        )
      `,
      [
        id,
        stepUpSessionId,
        eventType,
        fromState || null,
        toState || null,
        actorType,
        actorId || null,
        attemptNumber || null,
        deviceId || null,
        JSON.stringify(metadata || {}),
        idempotencyKey || null,
        correlationId || null,
        requestId || null
      ]
    );
  }

  async function createStepUpSession(input) {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO step_up_sessions (
            id,
            session_id,
            web_session_id,
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
            updated_by,
            created_at,
            updated_at,
            device_id_web,
            device_id_mobile,
            channel,
            biometric_verified,
            confirmed_at,
            consumed_at,
            invalidated_at,
            invalidated_reason
          )
          VALUES (
            $1,
            NULL,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'pending_verification',
            'biometric',
            'high',
            NULL,
            0,
            5,
            NOW(),
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            NOW(),
            NOW(),
            $14,
            NULL,
            'web',
            FALSE,
            NULL,
            NULL,
            NULL,
            NULL
          )
          RETURNING *
        `,
        [
          input.stepUpSessionId,              // $1
          input.webSessionId,                 // $2
          input.userId,                       // $3
          input.businessId,                   // $4
          input.purpose,                      // $5
          input.targetType,                   // $6
          input.targetId,                     // $7
          input.expiresAt,                    // $8
          input.idempotencyKey || null,       // $9
          input.correlationId || null,        // $10
          input.requestId || null,            // $11
          input.createdBy,                    // $12
          input.updatedBy,                    // $13
          input.deviceIdWeb || null           // $14
        ]
      );

      await appendStepUpEvent(client, {
        id: input.createdEventId,
        stepUpSessionId: input.stepUpSessionId,
        eventType: 'step_up_created',
        fromState: null,
        toState: 'pending_verification',
        actorType: 'user',
        actorId: input.userId,
        deviceId: input.deviceIdWeb || null,
        metadata: {
          source: 'web',
          webSessionId: input.webSessionId,
          businessId: input.businessId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason || null
        },
        idempotencyKey: input.createdEventIdempotencyKey,
        correlationId: input.correlationId,
        requestId: input.requestId
      });

      await appendStepUpEvent(client, {
        id: input.requestedEventId,
        stepUpSessionId: input.stepUpSessionId,
        eventType: 'verification_requested',
        fromState: 'pending_verification',
        toState: 'pending_verification',
        actorType: 'system',
        actorId: null,
        deviceId: input.deviceIdWeb || null,
        metadata: {
          verification_method: 'biometric',
          reason: input.reason || null
        },
        idempotencyKey: input.requestedEventIdempotencyKey,
        correlationId: input.correlationId,
        requestId: input.requestId
      });

      return rows[0];
    });
  }

  async function cancelPendingStepUpSession({ stepUpSessionId, eventId, reason, actorId }) {
    return withTransaction(async (client) => {
      const current = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          LIMIT 1
        `,
        [stepUpSessionId]
      );

      if (current.rowCount === 0) {
        return null;
      }

      const existing = current.rows[0];

      const { rows } = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'cancelled',
            invalidated_at = NOW(),
            invalidated_reason = $2,
            updated_at = NOW()
          WHERE id = $1
            AND state = 'pending_verification'
          RETURNING *
        `,
        [stepUpSessionId, reason || 'cancelled']
      );

      if (!rows[0]) {
        return null;
      }

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_cancelled',
        fromState: existing.state,
        toState: 'cancelled',
        actorType: 'system',
        actorId: actorId || null,
        deviceId: null,
        metadata: { reason: reason || 'cancelled' },
        idempotencyKey: `step_up_cancelled:${stepUpSessionId}:${eventId}`
      });

      return rows[0];
    });
  }

  async function approveStepUpSession({ stepUpSessionId, userId, deviceIdMobile, eventId }) {
    return withTransaction(async (client) => {
      const current = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          LIMIT 1
        `,
        [stepUpSessionId]
      );

      if (current.rowCount === 0) {
        return null;
      }

      const existing = current.rows[0];
      const nextAttempt = Number(existing.attempts_count || 0) + 1;

      const { rows } = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'verified',
            device_id_mobile = $2,
            biometric_verified = TRUE,
            confirmed_at = NOW(),
            updated_at = NOW(),
            updated_by = $3
          WHERE id = $1
            AND state = 'pending_verification'
            AND (expires_at IS NULL OR expires_at > NOW())
          RETURNING *
        `,
        [stepUpSessionId, deviceIdMobile || null, userId]
      );

      if (!rows[0]) {
        return null;
      }

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_verified',
        fromState: existing.state,
        toState: 'verified',
        actorType: 'user',
        actorId: userId,
        attemptNumber: nextAttempt,
        deviceId: deviceIdMobile || null,
        metadata: {
          verification_method: 'biometric'
        },
        idempotencyKey: `step_up_verified:${stepUpSessionId}:${eventId}`
      });

      return rows[0];
    });
  }

  async function rejectStepUpSession({ stepUpSessionId, userId, deviceIdMobile, eventId, reason }) {
    return withTransaction(async (client) => {
      const current = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          LIMIT 1
        `,
        [stepUpSessionId]
      );

      if (current.rowCount === 0) {
        return null;
      }

      const existing = current.rows[0];
      const nextAttempt = Number(existing.attempts_count || 0) + 1;

      const { rows } = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'cancelled',
            device_id_mobile = $2,
            invalidated_at = NOW(),
            invalidated_reason = $3,
            updated_at = NOW(),
            updated_by = $4
          WHERE id = $1
            AND state = 'pending_verification'
          RETURNING *
        `,
        [stepUpSessionId, deviceIdMobile || null, reason || 'mobile_rejected', userId]
      );

      if (!rows[0]) {
        return null;
      }

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_cancelled',
        fromState: existing.state,
        toState: 'cancelled',
        actorType: 'user',
        actorId: userId,
        attemptNumber: nextAttempt,
        deviceId: deviceIdMobile || null,
        metadata: {
          reason: reason || 'mobile_rejected'
        },
        idempotencyKey: `step_up_cancelled:${stepUpSessionId}:${eventId}`
      });

      return rows[0];
    });
  }

  async function expirePendingStepUpSession({ stepUpSessionId, eventId, reason }) {
    return withTransaction(async (client) => {
      const current = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          LIMIT 1
        `,
        [stepUpSessionId]
      );

      if (current.rowCount === 0) {
        return null;
      }

      const existing = current.rows[0];

      const { rows } = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'expired',
            invalidated_at = NOW(),
            invalidated_reason = $2,
            updated_at = NOW(),
            updated_by = COALESCE(updated_by, created_by, user_id)
          WHERE id = $1
            AND state = 'pending_verification'
            AND (expires_at IS NOT NULL AND expires_at <= NOW())
          RETURNING *
        `,
        [stepUpSessionId, reason || 'step_up_timeout']
      );

      if (!rows[0]) {
        return null;
      }

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_expired',
        fromState: existing.state,
        toState: 'expired',
        actorType: 'system',
        actorId: null,
        deviceId: null,
        metadata: {
          reason: reason || 'step_up_timeout'
        },
        idempotencyKey: `step_up_expired:${stepUpSessionId}:${eventId}`
      });

      return rows[0];
    });
  }

  async function consumeApprovedStepUpSession({ stepUpSessionId, eventId }) {
    return withTransaction(async (client) => {
      const current = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          LIMIT 1
        `,
        [stepUpSessionId]
      );

      if (current.rowCount === 0) {
        return null;
      }

      const existing = current.rows[0];

      const { rows } = await client.query(
        `
          UPDATE step_up_sessions
          SET
            consumed_at = NOW(),
            updated_at = NOW(),
            updated_by = COALESCE(updated_by, created_by, user_id)
          WHERE id = $1
            AND state = 'verified'
            AND consumed_at IS NULL
          RETURNING *
        `,
        [stepUpSessionId]
      );

      if (!rows[0]) {
        return null;
      }

      return rows[0];
    });
  }

  return {
    findWebSessionForStepUp,
    findStepUpSessionById,
    findPendingStepUpForAction,
    createStepUpSession,
    cancelPendingStepUpSession,
    approveStepUpSession,
    rejectStepUpSession,
    expirePendingStepUpSession,
    consumeApprovedStepUpSession
  };
}

module.exports = {
  createStepUpRepo
};