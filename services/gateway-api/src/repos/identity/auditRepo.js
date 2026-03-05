'use strict';

const identityDb = require('../../infrastructure/identityDb');

async function insertAuditEvent(clientOrDb, { actor_user_id, event_type, entity_type, entity_id, payload }) {
  const q = `
    INSERT INTO audit_events(actor_user_id, event_type, entity_type, entity_id, payload)
    VALUES ($1,$2,$3,$4,$5::jsonb)
  `;
  const params = [
    actor_user_id || null,
    event_type,
    entity_type,
    String(entity_id),
    JSON.stringify(payload || {}),
  ];

  if (clientOrDb && typeof clientOrDb.query === 'function') return clientOrDb.query(q, params);
  return identityDb.query(q, params);
}

module.exports = { insertAuditEvent };