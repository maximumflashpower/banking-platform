'use strict';

const identityDb = require('../../infrastructure/identityDb');

async function roleExists(role) {
  const r = await identityDb.query('SELECT 1 FROM business_roles WHERE role=$1', [role]);
  return r.rowCount > 0;
}

async function listRoles() {
  const r = await identityDb.query('SELECT role, description FROM business_roles ORDER BY role', []);
  return r.rows;
}

module.exports = { roleExists, listRoles };