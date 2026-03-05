'use strict';

const identityDb = require('../../infrastructure/identityDb');
const { roleExists } = require('./rolesRepo');
const { insertAuditEvent } = require('./auditRepo');

async function inviteMember({ business_id, user_id, role, actor_user_id }) {
  if (!(await roleExists(role))) {
    const err = new Error('invalid role');
    err.statusCode = 400;
    err.details = { role };
    throw err;
  }

  return identityDb.withTransaction(async (client) => {
    const m = await client.query(
      `
      INSERT INTO business_members(business_id, user_id, role, status)
      VALUES ($1,$2,$3,'invited')
      ON CONFLICT (business_id, user_id) WHERE status IN ('active','invited')
      DO UPDATE SET role=EXCLUDED.role
      RETURNING id, business_id, user_id, role, status, created_at
      `,
      [business_id, user_id, role]
    );

    await client.query(
      'INSERT INTO business_role_bindings(business_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [business_id, user_id, role]
    );

    await insertAuditEvent(client, {
      actor_user_id,
      event_type: 'MEMBER_INVITED',
      entity_type: 'business',
      entity_id: business_id,
      payload: { user_id, role },
    });

    return m.rows[0];
  });
}

async function assignRole({ business_id, user_id, role, actor_user_id }) {
  if (!(await roleExists(role))) {
    const err = new Error('invalid role');
    err.statusCode = 400;
    err.details = { role };
    throw err;
  }

  return identityDb.withTransaction(async (client) => {
    await client.query(
      'INSERT INTO business_role_bindings(business_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [business_id, user_id, role]
    );

    await client.query(
      `
      INSERT INTO business_members(business_id, user_id, role, status)
      VALUES ($1,$2,$3,'active')
      ON CONFLICT (business_id, user_id) WHERE status IN ('active','invited')
      DO UPDATE SET role=EXCLUDED.role
      `,
      [business_id, user_id, role]
    );

    await insertAuditEvent(client, {
      actor_user_id,
      event_type: 'ROLE_ASSIGNED',
      entity_type: 'business',
      entity_id: business_id,
      payload: { user_id, role },
    });

    return { ok: true };
  });
}

module.exports = { inviteMember, assignRole };