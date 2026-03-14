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
          AND invalidated_at IS NULL
        ORDER BY requested_at DESC, created_at DESC
        LIMIT 1
      `,
      [webSessionId, purpose, targetType, targetId]
    );

    return rows[0] || null;
  }

  async function findLatestStepUpForWebAction({ webSessionId, targetType, targetId }) {
    const { rows } = await runQuery(
      `
        SELECT *
        FROM step_up_sessions
        WHERE web_session_id = $1
          AND target_type = $2
          AND target_id = $3
        ORDER BY
          confirmed_at DESC NULLS LAST,
          requested_at DESC NULLS LAST,
          created_at DESC
        LIMIT 1
      `,
      [webSessionId, targetType, targetId]
    );

    return rows[0] || null;
  }

  async function findVerifiedStepUpForWebAction({ webSessionId, targetType, targetId }) {
    const { rows } = await runQuery(
      `
        SELECT *
        FROM step_up_sessions
        WHERE web_session_id = $1
          AND target_type = $2
          AND target_id = $3
          AND state = 'verified'
          AND invalidated_at IS NULL
        ORDER BY
          confirmed_at DESC NULLS LAST,
          requested_at DESC NULLS LAST,
          created_at DESC
        LIMIT 1
      `,
      [webSessionId, targetType, targetId]
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
  const effectiveIdempotencyKey = idempotencyKey || `${eventType}:${stepUpSessionId}:${id}`;

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
      actorType || 'system',
      actorId || null,
      attemptNumber || null,
      deviceId || null,
      JSON.stringify(metadata || {}),
      effectiveIdempotencyKey,
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
          input.stepUpSessionId,
          input.webSessionId,
          input.userId,
          input.businessId,
          input.purpose,
          input.targetType,
          input.targetId,
          input.expiresAt,
          input.idempotencyKey || null,
          input.correlationId || null,
          input.requestId || null,
          input.createdBy,
          input.updatedBy,
          input.deviceIdWeb || null
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
        actorType: 'user',
        actorId: input.userId,
        deviceId: input.deviceIdWeb || null,
        metadata: {
          source: 'web',
          webSessionId: input.webSessionId,
          businessId: input.businessId,
          targetType: input.targetType,
          targetId: input.targetId
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
      const existingResult = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          FOR UPDATE
        `,
        [stepUpSessionId]
      );

      const existing = existingResult.rows[0] || null;
      if (!existing || existing.state !== 'pending_verification' || existing.invalidated_at) {
        return null;
      }

      const updatedResult = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'cancelled',
            invalidated_at = NOW(),
            invalidated_reason = $2,
            updated_at = NOW(),
            updated_by = COALESCE($3, updated_by)
          WHERE id = $1
          RETURNING *
        `,
        [stepUpSessionId, reason || 'superseded', actorId || null]
      );

      const updated = updatedResult.rows[0];

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_cancelled',
        fromState: existing.state,
        toState: 'cancelled',
        actorType: 'user',
        actorId: actorId || existing.user_id,
        deviceId: existing.device_id_web || null,
        metadata: {
          reason: reason || 'superseded'
        }
      });

      return updated;
    });
  }

  async function expirePendingStepUpSession({ stepUpSessionId, eventId, reason }) {
    return withTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          FOR UPDATE
        `,
        [stepUpSessionId]
      );

      const existing = existingResult.rows[0] || null;
      if (!existing || existing.state !== 'pending_verification' || existing.invalidated_at) {
        return null;
      }

      const updatedResult = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'expired',
            invalidated_at = NOW(),
            invalidated_reason = $2,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [stepUpSessionId, reason || 'step_up_timeout']
      );

      const updated = updatedResult.rows[0];

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_expired',
        fromState: existing.state,
        toState: 'expired',
        actorType: 'system',
        actorId: existing.user_id,
        deviceId: existing.device_id_web || null,
        metadata: {
          reason: reason || 'step_up_timeout'
        }
      });

      return updated;
    });
  }

  async function expireVerifiedOrPendingStepUpSession({ stepUpSessionId, eventId, reason }) {
    return withTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          FOR UPDATE
        `,
        [stepUpSessionId]
      );

      const existing = existingResult.rows[0] || null;
      if (!existing || existing.invalidated_at) {
        return null;
      }

      if (existing.state !== 'pending_verification' && existing.state !== 'verified') {
        return null;
      }

      const updatedResult = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'expired',
            invalidated_at = NOW(),
            invalidated_reason = $2,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [stepUpSessionId, reason || 'step_up_timeout']
      );

      const updated = updatedResult.rows[0];

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_expired',
        fromState: existing.state,
        toState: 'expired',
        actorType: 'system',
        actorId: existing.user_id,
        deviceId: existing.device_id_mobile || existing.device_id_web || null,
        metadata: {
          reason: reason || 'step_up_timeout'
        }
      });

      return updated;
    });
  }

  async function rejectStepUpSession({ stepUpSessionId, userId, deviceIdMobile, eventId, reason }) {
    return withTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          FOR UPDATE
        `,
        [stepUpSessionId]
      );

      const existing = existingResult.rows[0] || null;
      if (!existing || existing.state !== 'pending_verification' || existing.invalidated_at) {
        return null;
      }

      const updatedResult = await client.query(
        `
          UPDATE step_up_sessions
          SET
            state = 'rejected',
            device_id_mobile = $2,
            biometric_verified = FALSE,
            invalidated_at = NOW(),
            invalidated_reason = $3,
            updated_at = NOW(),
            updated_by = $4
          WHERE id = $1
          RETURNING *
        `,
        [stepUpSessionId, deviceIdMobile, reason || 'mobile_rejected', userId]
      );

      const updated = updatedResult.rows[0];

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'verification_rejected',
        fromState: existing.state,
        toState: 'rejected',
        actorType: 'user',
        actorId: userId,
        deviceId: deviceIdMobile,
        metadata: {
          reason: reason || 'mobile_rejected'
        }
      });

      return updated;
    });
  }

  async function approveStepUpSession({ stepUpSessionId, userId, deviceIdMobile, eventId }) {
    return withTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          FOR UPDATE
        `,
        [stepUpSessionId]
      );

      const existing = existingResult.rows[0] || null;
      if (!existing || existing.state !== 'pending_verification' || existing.invalidated_at) {
        return null;
      }

      const updatedResult = await client.query(
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
          RETURNING *
        `,
        [stepUpSessionId, deviceIdMobile, userId]
      );

      const updated = updatedResult.rows[0];

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'verification_confirmed',
        fromState: existing.state,
        toState: 'verified',
        actorType: 'user',
        actorId: userId,
        deviceId: deviceIdMobile,
        metadata: {
          biometricVerified: true
        }
      });

      return updated;
    });
  }

  async function consumeApprovedStepUpSession({ stepUpSessionId, eventId }) {
    return consumeVerifiedStepUpSession({ stepUpSessionId, eventId });
  }

  async function consumeVerifiedStepUpSession({ stepUpSessionId, eventId }) {
    return withTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT *
          FROM step_up_sessions
          WHERE id = $1
          FOR UPDATE
        `,
        [stepUpSessionId]
      );

      const existing = existingResult.rows[0] || null;
      if (!existing || existing.state !== 'verified' || existing.invalidated_at || existing.consumed_at) {
        return null;
      }

      const updatedResult = await client.query(
        `
          UPDATE step_up_sessions
          SET
            consumed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [stepUpSessionId]
      );

      const updated = updatedResult.rows[0];

      await appendStepUpEvent(client, {
        id: eventId,
        stepUpSessionId,
        eventType: 'step_up_consumed',
        fromState: existing.state,
        toState: existing.state,
        actorType: 'system',
        actorId: existing.user_id,
        deviceId: existing.device_id_mobile || existing.device_id_web || null,
        metadata: {
          consumedAt: updated.consumed_at
        }
      });

      return updated;
    });
  }

  return {
    findWebSessionForStepUp,
    findStepUpSessionById,
    findPendingStepUpForAction,
    findLatestStepUpForWebAction,
    findVerifiedStepUpForWebAction,
    createStepUpSession,
    cancelPendingStepUpSession,
    expirePendingStepUpSession,
    expireVerifiedOrPendingStepUpSession,
    rejectStepUpSession,
    approveStepUpSession,
    consumeApprovedStepUpSession,
    consumeVerifiedStepUpSession
  };
}

module.exports = {
  createStepUpRepo
};
