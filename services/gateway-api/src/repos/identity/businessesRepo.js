'use strict';

const identityDb = require('../../infrastructure/identityDb');
const { insertAuditEvent } = require('./auditRepo');

async function createBusiness({ legal_name, actor_user_id }) {
  return identityDb.withTransaction(async (client) => {
    const b = await client.query(
      "INSERT INTO businesses(legal_name, status) VALUES ($1,'draft') RETURNING business_id, legal_name, status, created_at",
      [legal_name]
    );
    const business = b.rows[0];

    await client.query(
      "INSERT INTO business_owners(business_id, user_id, owner_type, status) VALUES ($1,$2,'primary','active')",
      [business.business_id, actor_user_id]
    );

    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES ($1,$2,'ADMIN','active') ON CONFLICT DO NOTHING",
      [business.business_id, actor_user_id]
    );

    await client.query(
      "INSERT INTO business_role_bindings(business_id, user_id, role) VALUES ($1,$2,'OWNER_PRIMARY') ON CONFLICT DO NOTHING",
      [business.business_id, actor_user_id]
    );
    await client.query(
      "INSERT INTO business_role_bindings(business_id, user_id, role) VALUES ($1,$2,'ADMIN') ON CONFLICT DO NOTHING",
      [business.business_id, actor_user_id]
    );

    await insertAuditEvent(client, {
      actor_user_id,
      event_type: 'BUSINESS_CREATED',
      entity_type: 'business',
      entity_id: business.business_id,
      payload: { legal_name },
    });

    return business;
  });
}

async function getBusinessAggregate(businessId) {
  const [b, owners, members, bindings] = await Promise.all([
    identityDb.query('SELECT business_id, legal_name, status, created_at FROM businesses WHERE business_id=$1', [businessId]),
    identityDb.query('SELECT id, business_id, user_id, owner_type, status, created_at FROM business_owners WHERE business_id=$1 ORDER BY created_at', [businessId]),
    identityDb.query('SELECT id, business_id, user_id, role, status, created_at FROM business_members WHERE business_id=$1 ORDER BY created_at', [businessId]),
    identityDb.query('SELECT id, business_id, user_id, role, created_at FROM business_role_bindings WHERE business_id=$1 ORDER BY created_at', [businessId]),
  ]);

  if (b.rowCount === 0) return null;

  return {
    business: b.rows[0],
    owners: owners.rows,
    members: members.rows,
    role_bindings: bindings.rows,
  };
}

module.exports = { createBusiness, getBusinessAggregate };