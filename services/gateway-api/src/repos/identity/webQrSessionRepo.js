'use strict';

const { randomUUID } = require('crypto');
const identityDb = require('../../infrastructure/identityDb');

const REQUEST_TTL_SECONDS = 180;
const ACTIVE_TTL_SECONDS = 900;

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
    lastSeenAt: row.last_seen_at
  };
}

async function insertSessionEvent({ webSessionId, eventType, payloadJson = {} }) {
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
        expires_at
      )
      values (
        $1,
        $2,
        null,
        $3,
        null,
        'pending',
        now() + make_interval(secs => $4::int)
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
      deviceIdWeb: session.deviceIdWeb
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
          set status = 'expired'
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
          JSON.stringify({ reason: 'expired_before_confirm' })
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
          last_seen_at = now()
        where session_request_id = $1
        returning *
      `,
      [
        sessionRequestId,
        userId,
        deviceIdWeb,
        activeSpaceId,
        ttlSeconds
      ]
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
          activeSpaceId
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

async function getSessionStatusByRequestId(sessionRequestId) {
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
        set status = 'expired'
        where session_id = $1
        returning *
      `,
      [row.session_id]
    );

    await insertSessionEvent({
      webSessionId: row.session_id,
      eventType: 'expired',
      payloadJson: { reason: 'expired_during_status_poll' }
    });

    return mapSession(expiredResult.rows[0]);
  }

  return mapSession(row);
}

async function revokeSession({ sessionId, userId }) {
  const result = await runQuery(
    `
      update web_sessions
      set status = 'revoked'
      where session_id = $1
        and user_id = $2
        and status = 'active'
      returning *
    `,
    [sessionId, userId]
  );

  const row = result.rows[0];
  if (!row) return null;

  const session = mapSession(row);

  await insertSessionEvent({
    webSessionId: session.sessionId,
    eventType: 'revoked',
    payloadJson: { userId }
  });

  return session;
}

async function touchLastSeen(sessionId) {
  const result = await runQuery(
    `
      update web_sessions
      set last_seen_at = now()
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
  touchLastSeen,
  insertSessionEvent
};