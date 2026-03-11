'use strict';

const { randomUUID } = require('crypto');

async function storeIncomingEvent(client, {
  provider,
  providerEventId,
  eventType,
  payload,
  correlationId = null,
  idempotencyKey = null
}) {
  const id = randomUUID();

  const { rows } = await client.query(
    `
    insert into public.cards_webhook_events (
      id,
      provider,
      provider_event_id,
      event_type,
      payload,
      correlation_id,
      idempotency_key,
      received_at
    ) values (
      $1,
      $2,
      $3,
      $4,
      $5::jsonb,
      $6,
      $7,
      now()
    )
    on conflict (provider, provider_event_id)
    do nothing
    returning *
    `,
    [
      id,
      provider,
      providerEventId,
      eventType,
      JSON.stringify(payload || {}),
      correlationId,
      idempotencyKey
    ]
  );

  if (rows.length > 0) {
    return {
      inserted: true,
      event: rows[0]
    };
  }

  const existing = await client.query(
    `
    select *
    from public.cards_webhook_events
    where provider = $1
      and provider_event_id = $2
    limit 1
    `,
    [provider, providerEventId]
  );

  return {
    inserted: false,
    event: existing.rows[0] || null
  };
}

async function findByProviderEventId(client, { provider, providerEventId }) {
  const { rows } = await client.query(
    `
    select *
    from public.cards_webhook_events
    where provider = $1
      and provider_event_id = $2
    limit 1
    `,
    [provider, providerEventId]
  );

  return rows[0] || null;
}

module.exports = {
  storeIncomingEvent,
  findByProviderEventId
};