'use strict';

async function storeIncomingEvent(client, {
  provider,
  providerEventId,
  eventType,
  cardToken = null,
  payload,
  correlationId = null,
  idempotencyKey = null,
}) {
  const inserted = await client.query(
    `
      INSERT INTO cards_webhook_events (
        provider,
        provider_event_id,
        event_type,
        card_token,
        payload,
        correlation_id,
        idempotency_key
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *
    `,
    [
      provider,
      providerEventId,
      eventType,
      cardToken,
      JSON.stringify(payload || {}),
      correlationId,
      idempotencyKey,
    ]
  );

  if (inserted.rows[0]) {
    return {
      inserted: true,
      event: inserted.rows[0],
    };
  }

  const existing = await client.query(
    `
      SELECT *
      FROM cards_webhook_events
      WHERE provider = $1
        AND provider_event_id = $2
      LIMIT 1
    `,
    [provider, providerEventId]
  );

  return {
    inserted: false,
    event: existing.rows[0] || null,
  };
}

module.exports = {
  storeIncomingEvent,
};