'use strict';

const { randomUUID } = require('crypto');

async function findByProviderReversalId(client, { providerReversalId }) {
  if (!providerReversalId) return null;

  const { rows } = await client.query(
    `
    select *
    from public.card_reversals
    where provider_reversal_id = $1::text
    limit 1
    `,
    [providerReversalId]
  );

  return rows[0] || null;
}

async function createReversal(client, {
  authorizationId,
  providerReversalId,
  captureId = null,
  amount,
  currency,
  payload
}) {
  const id = randomUUID();

  const { rows } = await client.query(
    `
    insert into public.card_reversals (
      id,
      authorization_id,
      provider_reversal_id,
      capture_id,
      amount,
      currency,
      payload,
      created_at
    ) values (
      $1::uuid,
      $2::uuid,
      $3::text,
      $4::uuid,
      $5::bigint,
      $6::text,
      $7::jsonb,
      now()
    )
    returning *
    `,
    [
      id,
      authorizationId,
      providerReversalId,
      captureId,
      amount,
      currency,
      JSON.stringify(payload || {})
    ]
  );

  return rows[0];
}

async function createPendingReversal(client, {
  provider,
  providerReversalId,
  authorizationId = null,
  providerCaptureId = null,
  amount,
  currency,
  payload
}) {
  const id = randomUUID();

  const { rows } = await client.query(
    `
    insert into public.card_pending_reversals (
      id,
      provider,
      provider_reversal_id,
      authorization_id,
      provider_capture_id,
      amount,
      currency,
      payload,
      status,
      created_at
    ) values (
      $1::uuid,
      $2::text,
      $3::text,
      $4::uuid,
      $5::text,
      $6::bigint,
      $7::text,
      $8::jsonb,
      'pending_capture_anchor',
      now()
    )
    on conflict (provider, provider_reversal_id)
    do update set provider_reversal_id = excluded.provider_reversal_id
    returning *
    `,
    [
      id,
      provider,
      providerReversalId,
      authorizationId,
      providerCaptureId,
      amount,
      currency,
      JSON.stringify(payload || {})
    ]
  );

  return rows[0];
}

async function findPendingReversalsForCapture(client, {
  providerCaptureId = null,
  authorizationId = null,
  amount = null,
  currency = null
}) {
  const { rows } = await client.query(
    `
    select *
    from public.card_pending_reversals
    where status = 'pending_capture_anchor'
      and (
        ($1::text is not null and provider_capture_id = $1::text)
        or
        (
          $2::uuid is not null
          and authorization_id = $2::uuid
          and amount = $3::bigint
          and currency = $4::text
        )
      )
    order by created_at asc
    `,
    [providerCaptureId, authorizationId, amount, currency]
  );

  return rows;
}

async function markPendingReversalResolved(client, {
  pendingReversalId,
  linkedCaptureId
}) {
  const { rows } = await client.query(
    `
    update public.card_pending_reversals
       set status = 'resolved',
           linked_capture_id = $2::uuid,
           resolved_at = now()
     where id = $1::uuid
     returning *
    `,
    [pendingReversalId, linkedCaptureId]
  );

  return rows[0] || null;
}

module.exports = {
  findByProviderReversalId,
  createReversal,
  createPendingReversal,
  findPendingReversalsForCapture,
  markPendingReversalResolved
};