'use strict';

const { randomUUID } = require('crypto');
const identityDb = require('../../infrastructure/identityDb');

const REQUEST_TTL_SECONDS = 180;
const ACTIVE_TTL_SECONDS = 900;
const INACTIVITY_TIMEOUT_SECONDS = 600;

function getDb() {
  if (typeof identityDb?.query === 'function') {
    return identityDb;
  }

  if (typeof identityDb?.pool?.query === 'function') {
    return identityDb.pool;
  }

  throw new Error('identityDb query interface not available');
}

async function runQuery(text, params) {
  return getDb().query(text, params);
}

function mapSession(row) {
  if (!row) return null;

  return {
    sessionId: row.session_id,
    sessionRequestId: row.session_request_id,
    userId: row.user_id,
    deviceIdWeb: row.device_id_web,
    activeSpaceId: row.active_space_id,
    status: row.status,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    lastActivityAt: row.last_activity_at,
    invalidatedReason: row.invalidated_reason,
    invalidatedAt: row.invalidated_at
  };
}

async function insertSessionEvent({
  webSessionId,
  eventType,
  payloadJson = {}
}) {
  await runQuery(
    `
      insert into web_session_events (
        id,
        web_session_id,
        event_type,
        payload_json
      )
      values ($1, $2, $3, $4::jsonb)
    `,
    [randomUUID(), webSessionId, eventType, JSON.stringify(payloadJson || {})]
  );
}

async function createSessionRequest({ deviceIdWeb, ttlSeconds = REQUEST_TTL_SECONDS }) {
  const result = await runQuery(
    `
      insert into web_sessions (
        session_id,
        session_request_id,
        user_id,
        device_id_web,
        active_space_id,
        status,
        expires_at,
        last_activity_at
      )
      values (
        $1,
        $2,
        null,
        $3,
        null,
        'pending',
        now() + make_interval(secs => $4::int),
        now()
      )
      returning *
    `,
    [randomUUID(), randomUUID(), deviceIdWeb, ttlSeconds]
  );

  const session = mapSession(result.rows[0]);

  await insertSessionEvent({
    webSessionId: session.sessionId,
    eventType: 'request_created',
    payloadJson: {
      sessionRequestId: session.sessionRequestId,
      deviceIdWeb: session.deviceIdWeb,
      actorType: 'web',
      actorId: deviceIdWeb
    }
  });

  return session;
}

async function confirmSessionRequest({
  sessionRequestId,
  userId,
  deviceIdWeb,
  activeSpaceId = null,
  ttlSeconds = ACTIVE_TTL_SECONDS
}) {
  const db = getDb();

  await db.query('begin');

  try {
    const existingResult = await db.query(
      `
        select *
        from web_sessions
        where session_request_id = $1
        for update
      `,
      [sessionRequestId]
    );

    const existing = existingResult.rows[0];

    if (!existing) {
      await db.query('rollback');
      return null;
    }

    if (
      existing.status === 'pending' &&
      new Date(existing.expires_at).getTime() <= Date.now()
    ) {
      const expiredResult = await db.query(
        `
          update web_sessions
          set
            status = 'expired',
            invalidated_reason = 'expired_before_confirm',
            invalidated_at = now()
          where session_id = $1
          returning *
        `,
        [existing.session_id]
      );

      await db.query(
        `
          insert into web_session_events (
            id,
            web_session_id,
            event_type,
            payload_json
          )
          values ($1, $2, $3, $4::jsonb)
        `,
        [
          randomUUID(),
          existing.session_id,
          'expired',
          JSON.stringify({
            reason: 'expired_before_confirm',
            actorType: 'system',
            actorId: 'stage7b'
          })
        ]
      );

      await db.query('commit');

      return {
        conflict: 'expired',
        session: mapSession(expiredResult.rows[0])
      };
    }

    if (existing.status === 'revoked') {
      await db.query('commit');
      return {
        conflict: 'revoked',
        session: mapSession(existing)
      };
    }

    if (existing.status === 'expired') {
      await db.query('commit');
      return {
        conflict: 'expired',
        session: mapSession(existing)
      };
    }

    if (existing.status === 'active') {
      await db.query('commit');
      return {
        alreadyActive: true,
        session: mapSession(existing)
      };
    }

    const updatedResult = await db.query(
      `
        update web_sessions
        set
          user_id = $2,
          device_id_web = $3,
          active_space_id = $4,
          status = 'active',
          confirmed_at = now(),
          expires_at = now() + make_interval(secs => $5::int),
          last_seen_at = now(),
          last_activity_at = now(),
          invalidated_reason = null,
          invalidated_at = null
        where session_request_id = $1
        returning *
      `,
      [sessionRequestId, userId, deviceIdWeb, activeSpaceId, ttlSeconds]
    );

    const updated = mapSession(updatedResult.rows[0]);

    await db.query(
      `
        insert into web_session_events (
          id,
          web_session_id,
          event_type,
          payload_json
        )
        values ($1, $2, $3, $4::jsonb)
      `,
      [
        randomUUID(),
        updated.sessionId,
        'confirmed',
        JSON.stringify({
          userId,
          deviceIdWeb,
          activeSpaceId,
          actorType: 'mobile_session',
          actorId: userId
        })
      ]
    );

    await db.query('commit');

    return {
      alreadyActive: false,
      session: updated
    };
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function expireInactiveActiveSessions({
  inactivityTimeoutSeconds = INACTIVITY_TIMEOUT_SECONDS
} = {}) {
  const db = getDb();

  const result = await db.query(
    `
      update web_sessions
      set
        status = 'expired',
        invalidated_reason = 'inactivity_timeout',
        invalidated_at = now()
      where status = 'active'
        and coalesce(last_activity_at, last_seen_at, confirmed_at, created_at)
            < now() - make_interval(secs => $1::int)
      returning session_id
    `,
    [inactivityTimeoutSeconds]
  );

  for (const row of result.rows) {
    await db.query(
      `
        insert into web_session_events (
          id,
          web_session_id,
          event_type,
          payload_json
        )
        values ($1, $2, $3, $4::jsonb)
      `,
      [
        randomUUID(),
        row.session_id,
        'inactivity_timeout',
        JSON.stringify({
          inactivityTimeoutSeconds,
          actorType: 'system',
          actorId: 'stage7b'
        })
      ]
    );
  }

  return result.rows.length;
}

async function getSessionStatusByRequestId(sessionRequestId) {
  await expireInactiveActiveSessions();

  const result = await runQuery(
    `
      select *
      from web_sessions
      where session_request_id = $1
      limit 1
    `,
    [sessionRequestId]
  );

  const row = result.rows[0];
  if (!row) return null;

  if (
    row.status === 'pending' &&
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    const expiredResult = await runQuery(
      `
        update web_sessions
        set
          status = 'expired',
          invalidated_reason = 'expired_during_status_poll',
          invalidated_at = now()
        where session_id = $1
        returning *
      `,
      [row.session_id]
    );

    await insertSessionEvent({
      webSessionId: row.session_id,
      eventType: 'expired',
      payloadJson: {
        reason: 'expired_during_status_poll',
        actorType: 'system',
        actorId: 'stage7b'
      }
    });

    return mapSession(expiredResult.rows[0]);
  }

  return mapSession(row);
}

async function revokeSession({ sessionId, userId, reason = 'revoked' }) {
  const result = await runQuery(
    `
      update web_sessions
      set
        status = 'revoked',
        invalidated_reason = $3,
        invalidated_at = now()
      where session_id = $1
        and user_id = $2
        and status = 'active'
      returning *
    `,
    [sessionId, userId, reason]
  );

  const row = result.rows[0];
  if (!row) return null;

  const session = mapSession(row);

  await insertSessionEvent({
    webSessionId: session.sessionId,
    eventType: reason,
    payloadJson: {
      userId,
      actorType: 'mobile_session',
      actorId: userId
    }
  });

  return session;
}

async function invalidateAllActiveSessionsForUser({
  userId,
  eventType,
  actorType = 'system',
  actorId = null,
  payloadJson = {}
}) {
  const result = await runQuery(
    `
      update web_sessions
      set
        status = 'revoked',
        invalidated_reason = $2,
        invalidated_at = now()
      where user_id = $1
        and status = 'active'
      returning session_id
    `,
    [userId, eventType]
  );

  for (const row of result.rows) {
    await insertSessionEvent({
      webSessionId: row.session_id,
      eventType,
      payloadJson: {
        ...payloadJson,
        actorType,
        actorId
      }
    });
  }

  return result.rows.length;
}

async function touchLastSeen(sessionId) {
  const result = await runQuery(
    `
      update web_sessions
      set
        last_seen_at = now(),
        last_activity_at = now()
      where session_id = $1
        and status = 'active'
      returning *
    `,
    [sessionId]
  );

  return mapSession(result.rows[0] || null);
}

module.exports = {
  createSessionRequest,
  confirmSessionRequest,
  getSessionStatusByRequestId,
  revokeSession,
  invalidateAllActiveSessionsForUser,
  touchLastSeen,
  expireInactiveActiveSessions,
  insertSessionEvent
};