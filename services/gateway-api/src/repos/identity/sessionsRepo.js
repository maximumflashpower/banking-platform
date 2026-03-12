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
      select *
      from sessions
      where session_id = $1
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
      set active_space_id = $2
      where session_id = $1
      returning *
    `,
    [session_id, space_id]
  );

  return result.rows[0] || null;
}

module.exports = {
  getById,
  setActiveSpace
};
