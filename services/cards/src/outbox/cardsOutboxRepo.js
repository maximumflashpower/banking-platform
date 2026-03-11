const { randomUUID } = require('crypto');

async function claimPublishableBatch(client, { workerId, limit = 50, staleClaimSeconds = 120 }) {
  const { rows } = await client.query(
    `
    with candidate as (
      select id
      from public.cards_outbox
      where status = 'pending'
        and available_at <= now()
        and (
          claimed_at is null
          or claimed_at < now() - make_interval(secs => $3::int)
        )
      order by created_at asc, id asc
      limit $2
      for update skip locked
    )
    update public.cards_outbox o
       set claimed_at = now(),
           claimed_by = $1,
           updated_at = now()
      from candidate c
     where o.id = c.id
     returning o.*
    `,
    [workerId, limit, staleClaimSeconds]
  );
  return rows;
}

async function markPublished(client, { id }) {
  await client.query(
    `
    update public.cards_outbox
       set status = 'published',
           published_at = now(),
           claimed_at = null,
           claimed_by = null,
           last_error = null,
           updated_at = now()
     where id = $1
    `,
    [id]
  );
}

async function markPublishFailed(client, { id, errorMessage, nextRetryAt }) {
  await client.query(
    `
    update public.cards_outbox
       set attempts = attempts + 1,
           status = 'pending',
           available_at = $3,
           claimed_at = null,
           claimed_by = null,
           last_error = $2,
           updated_at = now()
     where id = $1
    `,
    [id, String(errorMessage || '').slice(0, 2000), nextRetryAt]
  );
}

async function releaseStaleClaims(client, { olderThanSeconds = 120 }) {
  const { rowCount } = await client.query(
    `
    update public.cards_outbox
       set claimed_at = null,
           claimed_by = null,
           updated_at = now()
     where status = 'pending'
       and claimed_at is not null
       and claimed_at < now() - make_interval(secs => $1::int)
    `,
    [olderThanSeconds]
  );
  return rowCount;
}

async function insertOutboxEvent(client, {
  eventType,
  aggregateType,
  aggregateId,
  payload,
  correlationId = null,
  idempotencyKey = null
}) {
  const id = randomUUID();
  const { rows } = await client.query(
    `
    insert into public.cards_outbox (
      id,
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      status,
      attempts,
      available_at,
      correlation_id,
      idempotency_key,
      created_at,
      updated_at
    ) values (
      $1, $2, $3, $4, $5::jsonb,
      'pending', 0, now(), $6, $7, now(), now()
    )
    returning *
    `,
    [
      id,
      aggregateType,
      String(aggregateId),
      eventType,
      JSON.stringify(payload),
      correlationId,
      idempotencyKey
    ]
  );
  return rows[0];
}

async function getOutboxHealthSnapshot(client) {
  const { rows } = await client.query(
    `
    select
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'pending' and attempts > 0) as retrying,
      count(*) filter (
        where status = 'pending'
          and claimed_at is not null
          and claimed_at < now() - interval '2 minutes'
      ) as stuck_claims,
      coalesce(
        extract(epoch from now() - min(created_at)) filter (where status = 'pending'),
        0
      ) as oldest_pending_seconds
    from public.cards_outbox
    `
  );
  return rows[0];
}

module.exports = {
  claimPublishableBatch,
  markPublished,
  markPublishFailed,
  releaseStaleClaims,
  insertOutboxEvent,
  getOutboxHealthSnapshot
};