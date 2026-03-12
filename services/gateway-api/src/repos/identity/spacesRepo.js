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
        b.business_id as space_id,
        b.legal_name as name,
        bm.role_key,
        bm.membership_status
      from business_members bm
      join kyb_businesses b
        on b.business_id = bm.business_id
      where bm.user_id = $1
      order by b.legal_name asc, b.business_id asc
    `,
    [userId]
  );

  return result.rows;
}

async function getByIdForUser({ user_id, space_id }) {
  const result = await runQuery(
    `
      select
        b.business_id as space_id,
        b.legal_name as name,
        bm.role_key,
        bm.membership_status
      from business_members bm
      join kyb_businesses b
        on b.business_id = bm.business_id
      where bm.user_id = $1
        and b.business_id = $2
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
