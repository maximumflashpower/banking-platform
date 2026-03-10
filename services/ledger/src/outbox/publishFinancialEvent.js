'use strict';

const financialDb = require('../infrastructure/financialDb');

async function publishFinancialEvent(eventType, payload, client = financialDb) {
  if (!eventType) {
    throw new Error('event_type_required');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('event_payload_required');
  }

  const spaceId =
    payload?.data?.spaceId ||
    payload?.spaceId ||
    null;

  if (!spaceId) {
    throw new Error('event_space_id_required');
  }

  const aggregateId =
    payload?.data?.holdId ||
    payload?.data?.accountId ||
    payload?.eventId ||
    null;

  if (!aggregateId) {
    throw new Error('event_aggregate_id_required');
  }

  await client.query(
    `
      INSERT INTO financial_outbox (
        space_id,
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, now())
    `,
    [
      spaceId,
      'ledger_hold',
      aggregateId,
      eventType,
      JSON.stringify(payload),
    ]
  );
}

module.exports = {
  publishFinancialEvent,
};