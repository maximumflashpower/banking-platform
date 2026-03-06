'use strict';

const identityDb = require('../../infrastructure/identityDb');
const auditRepo = require('./auditRepo');

const ALLOWED = new Map([
  ['unverified', new Set(['pending'])],
  ['pending', new Set(['verified', 'rejected'])],
  ['verified', new Set([])],
  ['rejected', new Set([])],
]);

function canTransition(from, to) {
  return (ALLOWED.get(from) || new Set()).has(to);
}

async function getOrCreateKybRow(client, { business_id, legal_name }) {
  const row = await client.query(
    `SELECT id, business_id, legal_name, status, provider_ref, created_at, updated_at
     FROM kyb_businesses
     WHERE business_id=$1
     LIMIT 1`,
    [business_id]
  );

  if (row.rowCount) return row.rows[0];

  const created = await client.query(
    `INSERT INTO kyb_businesses (business_id, legal_name, status)
     VALUES ($1, $2, 'unverified')
     RETURNING id, business_id, legal_name, status, provider_ref, created_at, updated_at`,
    [business_id, legal_name || null]
  );

  return created.rows[0];
}

async function transitionStatus({ business_id, actor_user_id, to_status, provider_ref = null }) {
  return identityDb.withTransaction(async (client) => {
    // 1) lock row (o crear) para evitar carreras
    const currentRes = await client.query(
      `SELECT id, business_id, legal_name, status, provider_ref
       FROM kyb_businesses
       WHERE business_id=$1
       FOR UPDATE`,
      [business_id]
    );

    let current;
    if (currentRes.rowCount === 0) {
      // Si no existe, creamos unverified y seguimos
      current = await getOrCreateKybRow(client, { business_id });
      // re-lock
      const relock = await client.query(
        `SELECT id, business_id, legal_name, status, provider_ref
         FROM kyb_businesses
         WHERE business_id=$1
         FOR UPDATE`,
        [business_id]
      );
      current = relock.rows[0];
    } else {
      current = currentRes.rows[0];
    }

    const from = current.status;

    if (!canTransition(from, to_status)) {
      return {
        ok: false,
        error: 'invalid_transition',
        from,
        to: to_status,
      };
    }

    const updated = await client.query(
      `UPDATE kyb_businesses
       SET status=$2,
           provider_ref=COALESCE($3, provider_ref),
           updated_at=now()
       WHERE business_id=$1
       RETURNING id, business_id, legal_name, status, provider_ref, created_at, updated_at`,
      [business_id, to_status, provider_ref]
    );

    await auditRepo.insertAuditEvent(client, {
      actor_user_id,
      event_type: 'KYB_STATUS_CHANGED',
      entity_type: 'kyb_business',
      entity_id: updated.rows[0].id,
      payload: { business_id, from, to: to_status, provider_ref: provider_ref || null },
    });

    return { ok: true, kyb: updated.rows[0] };
  });
}

async function startKyb({ business_id, actor_user_id, legal_name }) {
  // start = asegurar row existe (unverified). NO cambia estado.
  return identityDb.withTransaction(async (client) => {
    const kyb = await getOrCreateKybRow(client, { business_id, legal_name });

    await auditRepo.insertAuditEvent(client, {
      actor_user_id,
      event_type: 'KYB_STARTED',
      entity_type: 'kyb_business',
      entity_id: kyb.id,
      payload: { business_id },
    });

    return { ok: true, kyb };
  });
}

async function submitKyb({ business_id, actor_user_id, provider_ref }) {
  // submit: unverified -> pending
  return transitionStatus({ business_id, actor_user_id, to_status: 'pending', provider_ref });
}

async function verifyKyb({ business_id, actor_user_id }) {
  // pending -> verified
  return transitionStatus({ business_id, actor_user_id, to_status: 'verified' });
}

async function rejectKyb({ business_id, actor_user_id }) {
  // pending -> rejected
  return transitionStatus({ business_id, actor_user_id, to_status: 'rejected' });
}

module.exports = {
  startKyb,
  submitKyb,
  verifyKyb,
  rejectKyb,
};