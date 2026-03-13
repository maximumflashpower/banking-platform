'use strict';

const identityDb = require('../../infrastructure/identityDb');

async function runQuery(text, params) {
  if (typeof identityDb?.query === 'function') {
    return identityDb.query(text, params);
  }

  if (typeof identityDb?.pool?.query === 'function') {
    return identityDb.pool.query(text, params);
  }

  throw new Error('identityDb query interface not available');
}

async function getById(sessionId) {
  const result = await runQuery(
    `
      select
        id,
        user_id,
        device_id,
        created_at,
        expires_at,
        space_id,
        revoked_at
      from sessions
      where id = $1
      limit 1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function setActiveSpace({ session_id, space_id }) {
  const result = await runQuery(
    `
      update sessions
      set space_id = $2
      where id = $1
      returning
        id,
        user_id,
        device_id,
        created_at,
        expires_at,
        space_id,
        revoked_at
    `,
    [session_id, space_id]
  );

  return result.rows[0] || null;
}

module.exports = {
  getById,
  setActiveSpace
};