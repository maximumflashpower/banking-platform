const crypto = require('crypto');

async function publishEvent(client, eventType, payload) {
  await client.query(
    `INSERT INTO financial_outbox (event_type, payload, processed)
     VALUES ($1, $2, false)`,
    [eventType, JSON.stringify(payload)]
  );
}

async function emitOutboxEvent(db, {
  aggregate_type,
  aggregate_id,
  event_type,
  payload,
  correlation_id,
  idempotency_key = null,
}) {
  const id = crypto.randomUUID();

  // El SQL depende del schema real de financial_outbox en tu repo.
  // Vamos a hacer un INSERT "mínimo" usando columnas típicas.
  // Si falla por columnas distintas, ajustamos con \d public.financial_outbox.
  const q = `
    INSERT INTO public.financial_outbox
      (id, aggregate_type, aggregate_id, event_type, payload, correlation_id, idempotency_key, created_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7, now())
  `;
  await db.query(q, [
    id,
    aggregate_type,
    aggregate_id,
    event_type,
    JSON.stringify(payload || {}),
    correlation_id,
    idempotency_key,
  ]);

  return id;
}

module.exports = { emitOutboxEvent };
