const { randomUUID } = require('crypto');

async function enqueueNormalizedEvent(client, {
  provider,
  providerEventId,
  eventType,
  orderingKey = null,
  aggregateId = null,
  payload,
  occurredAt = null
}) {
  const id = randomUUID();

  const { rows } = await client.query(
    `
    insert into public.card_event_inbox (
      id,
      provider,
      provider_event_id,
      event_type,
      ordering_key,
      aggregate_id,
      payload,
      occurred_at
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    on conflict (provider, provider_event_id)
    do update set provider_event_id = excluded.provider_event_id
    returning *
    `,
    [
      id,
      provider,
      providerEventId,
      eventType,
      orderingKey,
      aggregateId,
      JSON.stringify(payload),
      occurredAt
    ]
  );

  return rows[0];
}

async function claimPendingBatch(client, { workerId, limit = 50, staleClaimSeconds = 120 }) {
  const { rows } = await client.query(
    `
    with candidate as (
      select id
      from public.card_event_inbox
      where process_status in ('pending', 'failed_retryable', 'deferred')
        and (
          claimed_at is null
          or claimed_at < now() - make_interval(secs => $3::int)
        )
      order by received_at asc, id asc
      limit $2
      for update skip locked
    )
    update public.card_event_inbox i
       set claimed_at = now(),
           claimed_by = $1,
           process_status = case
             when i.process_status = 'deferred' then 'deferred'
             else 'processing'
           end,
           process_attempts = i.process_attempts + 1
      from candidate c
     where i.id = c.id
     returning i.*
    `,
    [workerId, limit, staleClaimSeconds]
  );

  return rows;
}

async function markProcessed(client, { id }) {
  await client.query(
    `
    update public.card_event_inbox
       set process_status = 'processed',
           processed_at = now(),
           claimed_at = null,
           claimed_by = null,
           last_error = null
     where id = $1
    `,
    [id]
  );
}

async function markDuplicate(client, { id, duplicateOf = null }) {
  await client.query(
    `
    update public.card_event_inbox
       set process_status = 'duplicate',
           processed_at = now(),
           claimed_at = null,
           claimed_by = null,
           duplicate_of = $2,
           last_error = null
     where id = $1
    `,
    [id, duplicateOf]
  );
}

async function markDeferred(client, { id, reason = null }) {
  await client.query(
    `
    update public.card_event_inbox
       set process_status = 'deferred',
           claimed_at = null,
           claimed_by = null,
           last_error = $2
     where id = $1
    `,
    [id, reason ? String(reason).slice(0, 1000) : null]
  );
}

async function markRetryableFailure(client, { id, reason = null }) {
  await client.query(
    `
    update public.card_event_inbox
       set process_status = 'failed_retryable',
           claimed_at = null,
           claimed_by = null,
           last_error = $2
     where id = $1
    `,
    [id, reason ? String(reason).slice(0, 1000) : null]
  );
}

async function markTerminalFailure(client, { id, reason = null }) {
  await client.query(
    `
    update public.card_event_inbox
       set process_status = 'failed_terminal',
           processed_at = now(),
           claimed_at = null,
           claimed_by = null,
           last_error = $2
     where id = $1
    `,
    [id, reason ? String(reason).slice(0, 1000) : null]
  );
}

async function getInboxHealthSnapshot(client) {
  const { rows } = await client.query(
    `
    select
      count(*) filter (where process_status in ('pending', 'processing', 'failed_retryable')) as pending,
      count(*) filter (where process_status = 'deferred') as deferred,
      count(*) filter (where process_status = 'failed_retryable') as failed_retryable,
      coalesce(
        extract(epoch from now() - min(received_at)) filter (
          where process_status in ('pending', 'processing', 'failed_retryable', 'deferred')
        ),
        0
      ) as oldest_pending_seconds
    from public.card_event_inbox
    `
  );

  return rows[0];
}

module.exports = {
  enqueueNormalizedEvent,
  claimPendingBatch,
  markProcessed,
  markDuplicate,
  markDeferred,
  markRetryableFailure,
  markTerminalFailure,
  getInboxHealthSnapshot
};