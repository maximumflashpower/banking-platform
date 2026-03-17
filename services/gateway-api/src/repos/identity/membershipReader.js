'use strict';

const identityDb = require('../../infrastructure/identityDb');

async function isUserInSpace({ userId, spaceId }) {
  if (!userId || !spaceId) {
    return false;
  }

  const result = await identityDb.query(
    `
      SELECT 1
      FROM business_members
      WHERE user_id = $1
        AND business_id = $2
      LIMIT 1
    `,
    [userId, spaceId]
  );

  return Boolean(result.rows[0]);
}

module.exports = {
  isUserInSpace,
};