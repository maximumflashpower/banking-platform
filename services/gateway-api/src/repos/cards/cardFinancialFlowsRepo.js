'use strict';

async function findCaptureByAuthorizationId(cardsDb, authorizationId) {
  const result = await cardsDb.query(
    `
      SELECT *
      FROM card_captures
      WHERE authorization_id = $1
      LIMIT 1
    `,
    [authorizationId]
  );

  return result.rows[0] || null;
}

async function findReversalByAuthorizationId(cardsDb, authorizationId) {
  const result = await cardsDb.query(
    `
      SELECT *
      FROM card_reversals
      WHERE authorization_id = $1
      LIMIT 1
    `,
    [authorizationId]
  );

  return result.rows[0] || null;
}

async function insertCapture(cardsDb, input) {
  const result = await cardsDb.query(
    `
      INSERT INTO card_captures (
        authorization_id,
        provider,
        provider_event_id,
        provider_auth_id,
        amount,
        currency,
        capture_type,
        status,
        ledger_journal_entry_id,
        raw_payload,
        captured_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,'total','posted',$7,$8::jsonb,COALESCE($9::timestamptz, now()))
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *
    `,
    [
      input.authorizationId,
      input.provider,
      input.providerEventId,
      input.providerAuthId || null,
      input.amount,
      input.currency,
      input.ledgerJournalEntryId || null,
      JSON.stringify(input.rawPayload || {}),
      input.capturedAt || null,
    ]
  );

  return result.rows[0] || null;
}

async function insertReversal(cardsDb, input) {
  const result = await cardsDb.query(
    `
      INSERT INTO card_reversals (
        authorization_id,
        provider,
        provider_event_id,
        provider_auth_id,
        amount,
        currency,
        status,
        raw_payload,
        reversed_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,'posted',$7::jsonb,COALESCE($8::timestamptz, now()))
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *
    `,
    [
      input.authorizationId,
      input.provider,
      input.providerEventId,
      input.providerAuthId || null,
      input.amount,
      input.currency,
      JSON.stringify(input.rawPayload || {}),
      input.reversedAt || null,
    ]
  );

  return result.rows[0] || null;
}

async function insertSettlement(cardsDb, input) {
  const result = await cardsDb.query(
    `
      INSERT INTO card_settlements (
        authorization_id,
        capture_id,
        provider,
        provider_event_id,
        provider_auth_id,
        amount,
        currency,
        settlement_type,
        status,
        raw_payload,
        settled_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'capture_total','posted',$8::jsonb,COALESCE($9::timestamptz, now()))
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *
    `,
    [
      input.authorizationId,
      input.captureId,
      input.provider,
      input.providerEventId,
      input.providerAuthId || null,
      input.amount,
      input.currency,
      JSON.stringify(input.rawPayload || {}),
      input.settledAt || null,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  findCaptureByAuthorizationId,
  findReversalByAuthorizationId,
  insertCapture,
  insertReversal,
  insertSettlement,
};