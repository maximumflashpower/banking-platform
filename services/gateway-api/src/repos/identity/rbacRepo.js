'use strict';

const identityDb = require('../../infrastructure/identityDb');

async function hasAnyRole(businessId, userId, roles) {
  const r = await identityDb.query(
    'SELECT 1 FROM business_role_bindings WHERE business_id=$1 AND user_id=$2 AND role = ANY($3::text[]) LIMIT 1',
    [businessId, userId, roles]
  );
  return r.rowCount > 0;
}

module.exports = { hasAnyRole };