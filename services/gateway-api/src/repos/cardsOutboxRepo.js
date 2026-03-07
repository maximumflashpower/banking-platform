async function appendEvent(client, {
  aggregateType,
  aggregateId,
  eventType,
  payload,
  correlationId = null,
  idempotencyKey = null,
}) {
  const result = await client.query(
    `
      INSERT INTO cards_outbox (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        correlation_id,
        idempotency_key
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6)
      RETURNING *
    `,
    [
      aggregateType,
      aggregateId,
      eventType,
      JSON.stringify(payload || {}),
      correlationId,
      idempotencyKey,
    ]
  );

  return result.rows[0];
}

async function findCardCreatedEventByIdempotencyKey(client, idempotencyKey) {
  if (!idempotencyKey) return null;

  const result = await client.query(
    `
      SELECT *
      FROM cards_outbox
      WHERE event_type = 'card.created.v1'
        AND idempotency_key = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [idempotencyKey]
  );

  return result.rows[0] || null;
}

async function listByAggregateId(cardDb, aggregateId) {
  const result = await cardDb.query(
    `
      SELECT *
      FROM cards_outbox
      WHERE aggregate_id = $1
      ORDER BY created_at DESC
    `,
    [aggregateId]
  );

  return result.rows;
}

module.exports = {
  appendEvent,
  findCardCreatedEventByIdempotencyKey,
  listByAggregateId,
};