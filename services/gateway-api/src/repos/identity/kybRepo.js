'use strict';

const identityDb = require('../../infrastructure/identityDb');
const { insertAuditEvent } = require('./auditRepo');

async function startKyb({ business_id, actor_user_id }) {
  return identityDb.withTransaction(async (client) => {
    await client.query("UPDATE businesses SET status='pending_kyb' WHERE business_id=$1", [business_id]);

    const active = await client.query(
      "SELECT id, status FROM business_kyb_submissions WHERE business_id=$1 AND status IN ('draft','started','submitted') ORDER BY submitted_at NULLS FIRST, id LIMIT 1",
      [business_id]
    );

    if (active.rowCount === 0) {
      await client.query("INSERT INTO business_kyb_submissions(business_id, status) VALUES ($1,'started')", [business_id]);
    } else if (active.rows[0].status !== 'started') {
      await client.query("UPDATE business_kyb_submissions SET status='started' WHERE id=$1", [active.rows[0].id]);
    }

    await insertAuditEvent(client, {
      actor_user_id,
      event_type: 'KYB_STARTED',
      entity_type: 'business',
      entity_id: business_id,
      payload: {},
    });

    return { ok: true };
  });
}

async function submitKyb({ business_id, actor_user_id, provider_ref, payload }) {
  return identityDb.withTransaction(async (client) => {
    const active = await client.query(
      "SELECT id FROM business_kyb_submissions WHERE business_id=$1 AND status IN ('draft','started','submitted') ORDER BY submitted_at NULLS FIRST, id LIMIT 1",
      [business_id]
    );

    if (active.rowCount === 0) {
      await client.query(
        `
        INSERT INTO business_kyb_submissions(business_id, provider_ref, submitted_at, status, payload)
        VALUES ($1,$2,now(),'submitted',$3::jsonb)
        `,
        [business_id, provider_ref || null, JSON.stringify(payload || {})]
      );
    } else {
      await client.query(
        `
        UPDATE business_kyb_submissions
        SET provider_ref=$2, submitted_at=now(), status='submitted', payload=$3::jsonb
        WHERE id=$1
        `,
        [active.rows[0].id, provider_ref || null, JSON.stringify(payload || {})]
      );
    }

    await insertAuditEvent(client, {
      actor_user_id,
      event_type: 'KYB_SUBMITTED',
      entity_type: 'business',
      entity_id: business_id,
      payload: { provider_ref: provider_ref || null },
    });

    return { ok: true };
  });
}

module.exports = { startKyb, submitKyb };