'use strict';

const cardsDb = require('../../infrastructure/cardsDb');
const cardControlsRepo = require('./cardControlsRepo');
const cardsOutboxRepo = require('./cardsOutboxRepo');

function mapCard(card, controls) {
  return {
    id: card.id,
    card_token: card.card_token,
    business_id: card.business_id,
    user_id: card.user_id,
    space_uuid: card.space_uuid,
    program_id: card.program_id,
    brand: card.brand,
    network: card.network,
    last4: card.last4,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    cardholder_name: card.cardholder_name,
    status: card.status,
    freeze_reason: card.freeze_reason,
    metadata: card.metadata,
    created_at: card.created_at,
    updated_at: card.updated_at,
    controls: controls
      ? {
          id: controls.id,
          card_id: controls.card_id,
          atm_enabled: controls.atm_enabled,
          ecommerce_enabled: controls.ecommerce_enabled,
          international_enabled: controls.international_enabled,
          contactless_enabled: controls.contactless_enabled,
          daily_spend_limit: controls.daily_spend_limit,
          monthly_spend_limit: controls.monthly_spend_limit,
          single_tx_limit: controls.single_tx_limit,
          currency: controls.currency,
          metadata: controls.metadata,
          created_at: controls.created_at,
          updated_at: controls.updated_at,
        }
      : null,
  };
}

async function findById(id) {
  const result = await cardsDb.query(
    `
      SELECT *
      FROM cards
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  const card = result.rows[0];
  if (!card) return null;

  const controls = await cardControlsRepo.getByCardId(cardsDb, id);
  return mapCard(card, controls);
}

async function listRecent(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  const result = await cardsDb.query(
    `
      SELECT c.*, cl.id AS controls_id, cl.card_id AS controls_card_id,
             cl.atm_enabled, cl.ecommerce_enabled, cl.international_enabled,
             cl.contactless_enabled, cl.daily_spend_limit, cl.monthly_spend_limit,
             cl.single_tx_limit, cl.currency, cl.metadata AS controls_metadata,
             cl.created_at AS controls_created_at, cl.updated_at AS controls_updated_at
      FROM cards c
      LEFT JOIN card_controls_limits cl ON cl.card_id = c.id
      ORDER BY c.created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    card_token: row.card_token,
    business_id: row.business_id,
    user_id: row.user_id,
    space_uuid: row.space_uuid,
    program_id: row.program_id,
    brand: row.brand,
    network: row.network,
    last4: row.last4,
    exp_month: row.exp_month,
    exp_year: row.exp_year,
    cardholder_name: row.cardholder_name,
    status: row.status,
    freeze_reason: row.freeze_reason,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    controls: row.controls_id
      ? {
          id: row.controls_id,
          card_id: row.controls_card_id,
          atm_enabled: row.atm_enabled,
          ecommerce_enabled: row.ecommerce_enabled,
          international_enabled: row.international_enabled,
          contactless_enabled: row.contactless_enabled,
          daily_spend_limit: row.daily_spend_limit,
          monthly_spend_limit: row.monthly_spend_limit,
          single_tx_limit: row.single_tx_limit,
          currency: row.currency,
          metadata: row.controls_metadata,
          created_at: row.controls_created_at,
          updated_at: row.controls_updated_at,
        }
      : null,
  }));
}

async function createCard(payload, options = {}) {
  const {
    idempotencyKey = null,
    correlationId = null,
  } = options;

  return cardsDb.withTransaction(async (client) => {
    if (idempotencyKey) {
      const existingEvent =
        await cardsOutboxRepo.findCardCreatedEventByIdempotencyKey(client, idempotencyKey);

      if (existingEvent) {
        const existingCardResult = await client.query(
          `
            SELECT *
            FROM cards
            WHERE id = $1
            LIMIT 1
          `,
          [existingEvent.aggregate_id]
        );

        const existingCard = existingCardResult.rows[0];
        if (existingCard) {
          const existingControls = await cardControlsRepo.getByCardId(client, existingCard.id);
          return mapCard(existingCard, existingControls);
        }
      }
    }

    const insertResult = await client.query(
      `
        INSERT INTO cards (
          card_token,
          business_id,
          user_id,
          space_uuid,
          program_id,
          brand,
          network,
          last4,
          exp_month,
          exp_year,
          cardholder_name,
          status,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12::jsonb)
        ON CONFLICT (card_token) DO NOTHING
        RETURNING *
      `,
      [
        payload.card_token,
        payload.business_id || null,
        payload.user_id || null,
        payload.space_uuid || null,
        payload.program_id || null,
        payload.brand || null,
        payload.network || null,
        payload.last4,
        payload.exp_month || null,
        payload.exp_year || null,
        payload.cardholder_name || null,
        JSON.stringify(payload.metadata || {}),
      ]
    );

    let card = insertResult.rows[0];
    let createdNow = Boolean(card);

    if (!card) {
      const existing = await client.query(
        `
          SELECT *
          FROM cards
          WHERE card_token = $1
          LIMIT 1
        `,
        [payload.card_token]
      );
      card = existing.rows[0];
      createdNow = false;
    }

    const controls = await cardControlsRepo.createDefaultControls(client, card.id);

    if (createdNow) {
      await cardsOutboxRepo.appendEvent(client, {
        aggregateType: 'card',
        aggregateId: card.id,
        eventType: 'card.created.v1',
        payload: {
          card_id: card.id,
          card_token: card.card_token,
          business_id: card.business_id,
          user_id: card.user_id,
          space_uuid: card.space_uuid,
          status: card.status,
        },
        correlationId,
        idempotencyKey,
      });
    }

    return mapCard(card, controls);
  });
}

async function freezeCard(cardId, freezeReason, options = {}) {
  const {
    correlationId = null,
    idempotencyKey = null,
  } = options;

  return cardsDb.withTransaction(async (client) => {
    const existing = await client.query(
      `
        SELECT *
        FROM cards
        WHERE id = $1
        FOR UPDATE
      `,
      [cardId]
    );

    const card = existing.rows[0];
    if (!card) return null;

    if (card.status === 'closed') {
      const error = new Error('closed cards cannot be frozen');
      error.code = 'CARD_STATUS_INVALID';
      error.httpStatus = 409;
      throw error;
    }

    let current = card;

    if (card.status !== 'frozen') {
      const updated = await client.query(
        `
          UPDATE cards
          SET status = 'frozen',
              freeze_reason = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [cardId, freezeReason]
      );

      current = updated.rows[0];

      await cardsOutboxRepo.appendEvent(client, {
        aggregateType: 'card',
        aggregateId: current.id,
        eventType: 'card.status.changed.v1',
        payload: {
          card_id: current.id,
          card_token: current.card_token,
          previous_status: card.status,
          current_status: current.status,
          freeze_reason: current.freeze_reason,
        },
        correlationId,
        idempotencyKey,
      });
    }

    const controls = await cardControlsRepo.getByCardId(client, current.id);
    return mapCard(current, controls);
  });
}

async function unfreezeCard(cardId, options = {}) {
  const {
    correlationId = null,
    idempotencyKey = null,
  } = options;

  return cardsDb.withTransaction(async (client) => {
    const existing = await client.query(
      `
        SELECT *
        FROM cards
        WHERE id = $1
        FOR UPDATE
      `,
      [cardId]
    );

    const card = existing.rows[0];
    if (!card) return null;

    if (card.status === 'closed') {
      const error = new Error('closed cards cannot be unfrozen');
      error.code = 'CARD_STATUS_INVALID';
      error.httpStatus = 409;
      throw error;
    }

    let current = card;

    if (card.status === 'frozen') {
      const updated = await client.query(
        `
          UPDATE cards
          SET status = 'active',
              freeze_reason = NULL,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [cardId]
      );

      current = updated.rows[0];

      await cardsOutboxRepo.appendEvent(client, {
        aggregateType: 'card',
        aggregateId: current.id,
        eventType: 'card.status.changed.v1',
        payload: {
          card_id: current.id,
          card_token: current.card_token,
          previous_status: card.status,
          current_status: current.status,
          freeze_reason: null,
        },
        correlationId,
        idempotencyKey,
      });
    }

    const controls = await cardControlsRepo.getByCardId(client, current.id);
    return mapCard(current, controls);
  });
}

module.exports = {
  createCard,
  findById,
  listRecent,
  freezeCard,
  unfreezeCard,
};