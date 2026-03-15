'use strict';

const crypto = require('crypto');
const identityDb = require('../../infrastructure/identityDb');

function stableStringify(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

function normalizeHash(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalEventPayload(event) {
  return {
    request_id: event.request_id || null,
    correlation_id: event.correlation_id || null,
    actor_user_id: event.actor_user_id || null,
    actor_session_id: event.actor_session_id || null,
    actor_space_id: event.actor_space_id || null,
    actor_membership_id: event.actor_membership_id || null,
    event_category: event.event_category,
    event_type: event.event_type,
    target_type: event.target_type || null,
    target_id: event.target_id || null,
    action: event.action,
    result: event.result,
    risk_level: event.risk_level || null,
    reason: event.reason || null,
    ip_address: event.ip_address || null,
    user_agent: event.user_agent || null,
    route_method: event.route_method || null,
    route_path: event.route_path || null,
    http_status: Number.isInteger(event.http_status) ? event.http_status : null,
    metadata: normalizeMetadata(event.metadata)
  };
}

function buildEntryHash(payload, previousHash) {
  return sha256(
    stableStringify({
      ...payload,
      previous_hash: normalizeHash(previousHash)
    })
  );
}

async function appendAuditEvent(event) {
  return identityDb.withTransaction(async (client) => {
    const prev = await client.query(`
      SELECT entry_hash
      FROM audit_log_immutable
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT 1
    `);

    const previousHash = prev.rowCount
      ? normalizeHash(prev.rows[0].entry_hash)
      : null;

    const payload = canonicalEventPayload(event);
    const entryHash = buildEntryHash(payload, previousHash);

    const result = await client.query(
      `
        INSERT INTO audit_log_immutable (
          request_id,
          correlation_id,
          actor_user_id,
          actor_session_id,
          actor_space_id,
          actor_membership_id,
          event_category,
          event_type,
          target_type,
          target_id,
          action,
          result,
          risk_level,
          reason,
          ip_address,
          user_agent,
          route_method,
          route_path,
          http_status,
          metadata,
          previous_hash,
          entry_hash
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20::jsonb, $21, $22
        )
        RETURNING id, occurred_at, entry_hash, previous_hash
      `,
      [
        payload.request_id,
        payload.correlation_id,
        payload.actor_user_id,
        payload.actor_session_id,
        payload.actor_space_id,
        payload.actor_membership_id,
        payload.event_category,
        payload.event_type,
        payload.target_type,
        payload.target_id,
        payload.action,
        payload.result,
        payload.risk_level,
        payload.reason,
        payload.ip_address,
        payload.user_agent,
        payload.route_method,
        payload.route_path,
        payload.http_status,
        JSON.stringify(payload.metadata),
        previousHash,
        entryHash
      ]
    );

    return result.rows[0];
  });
}

async function listAuditEvents(filters = {}) {
  const clauses = [];
  const values = [];

  const push = (sql, value) => {
    values.push(value);
    clauses.push(`${sql} $${values.length}`);
  };

  if (filters.from) push('occurred_at >=', filters.from);
  if (filters.to) push('occurred_at <=', filters.to);
  if (filters.event_category) push('event_category =', filters.event_category);
  if (filters.event_type) push('event_type =', filters.event_type);
  if (filters.actor_user_id) push('actor_user_id =', filters.actor_user_id);
  if (filters.target_type) push('target_type =', filters.target_type);
  if (filters.target_id) push('target_id =', filters.target_id);
  if (filters.request_id) push('request_id =', filters.request_id);
  if (filters.correlation_id) push('correlation_id =', filters.correlation_id);

  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
  values.push(limit);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await identityDb.query(
    `
      SELECT
        id,
        occurred_at,
        created_at,
        request_id,
        correlation_id,
        actor_user_id,
        actor_session_id,
        actor_space_id,
        actor_membership_id,
        event_category,
        event_type,
        target_type,
        target_id,
        action,
        result,
        risk_level,
        reason,
        ip_address,
        user_agent,
        route_method,
        route_path,
        http_status,
        metadata,
        previous_hash,
        entry_hash
      FROM audit_log_immutable
      ${where}
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows;
}

function canonicalRow(row) {
  return canonicalEventPayload({
    request_id: row.request_id,
    correlation_id: row.correlation_id,
    actor_user_id: row.actor_user_id,
    actor_session_id: row.actor_session_id,
    actor_space_id: row.actor_space_id,
    actor_membership_id: row.actor_membership_id,
    event_category: row.event_category,
    event_type: row.event_type,
    target_type: row.target_type,
    target_id: row.target_id,
    action: row.action,
    result: row.result,
    risk_level: row.risk_level,
    reason: row.reason,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    route_method: row.route_method,
    route_path: row.route_path,
    http_status: row.http_status,
    metadata: row.metadata
  });
}

function verifyAuditChain(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return true;
  }

  const ordered = [...rows].reverse();

  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i];
    const actualPreviousHash = normalizeHash(row.previous_hash);
    const actualEntryHash = normalizeHash(row.entry_hash);

    const expectedPreviousHash =
      i === 0 ? actualPreviousHash : normalizeHash(ordered[i - 1].entry_hash);

    if (actualPreviousHash !== expectedPreviousHash) {
      return false;
    }

    const expectedEntryHash = buildEntryHash(
      canonicalRow(row),
      actualPreviousHash
    );

    if (actualEntryHash !== expectedEntryHash) {
      return false;
    }
  }

  return true;
}

module.exports = {
  appendAuditEvent,
  listAuditEvents,
  verifyAuditChain,
  buildEntryHash
};
