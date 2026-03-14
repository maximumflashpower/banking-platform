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

async function listForUser(userId) {
  const result = await runQuery(
    `
      select
        s.id as space_id,
        s.id as name,
        s.type,
        s.owner_user_id
      from spaces s
      where s.owner_user_id = $1
      order by s.created_at asc, s.id asc
    `,
    [userId]
  );

  return result.rows;
}

async function getByIdForUser({ user_id, space_id }) {
  const result = await runQuery(
    `
      select
        s.id as space_id,
        s.id as name,
        s.type,
        s.owner_user_id
      from spaces s
      where s.owner_user_id = $1
        and s.id = $2
      limit 1
    `,
    [user_id, space_id]
  );

  return result.rows[0] || null;
}

async function hasUserAccessToSpace({ user_id, space_id }) {
  const row = await getByIdForUser({ user_id, space_id });
  return Boolean(row);
}

module.exports = {
  listForUser,
  listByUserId: listForUser,
  getByIdForUser,
  getForUserAndSpace: getByIdForUser,
  findForUserSpace: getByIdForUser,
  hasUserAccessToSpace
};