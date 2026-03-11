'use strict';

const { randomUUID } = require('crypto');

async function findByProviderCaptureId(client, { providerCaptureId }) {
  if (!providerCaptureId) return null;

  const { rows } = await client.query(
    `
    select *
    from public.card_captures
    where provider_capture_id = $1::text
    limit 1
    `,
    [providerCaptureId]
  );

  return rows[0] || null;
}

async function createCapture(client, {
  authorizationId,
  provider,
  providerEventId,
  providerAuthId,
  providerCaptureId,
  amount,
  currency,
  payload
}) {
  const id = randomUUID();

  const { rows } = await client.query(
    `
    insert into public.card_captures (
      id,
      authorization_id,
      provider,
      provider_event_id,
      provider_auth_id,
      provider_capture_id,
      amount,
      currency,
      capture_type,
      status,
      raw_payload,
      captured_at,
      created_at
    ) values (
      $1::uuid,
      $2::uuid,
      $3::text,
      $4::text,
      $5::text,
      $6::text,
      $7::bigint,
      $8::text,
      'total',
      'posted',
      $9::jsonb,
      now(),
      now()
    )
    returning *
    `,
    [
      id,
      authorizationId,
      provider,
      providerEventId,
      providerAuthId,
      providerCaptureId,
      amount,
      currency,
      JSON.stringify(payload || {})
    ]
  );

  return rows[0];
}

module.exports = {
  findByProviderCaptureId,
  createCapture
};