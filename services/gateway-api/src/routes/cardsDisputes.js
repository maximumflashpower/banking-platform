'use strict';

const express = require('express');
const crypto = require('crypto');

const cardsDb = require('../infrastructure/cardsDb');
const caseDb = require('../infrastructure/caseDb');
const financialDb = require('../infrastructure/financialDb');

const cardsRepo = require('../repos/cards/cardsRepo');
const cardAuthorizationsRepo = require('../repos/cards/cardAuthorizationsRepo');
const cardDisputesRepo = require('../repos/cards/cardDisputesRepo');
const cardsOutboxRepo = require('../repos/cards/cardsOutboxRepo');

const router = express.Router();

function newId() {
  return crypto.randomUUID();
}

function readRequiredHeader(req, headerName) {
  const value = req.header(headerName);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function createCaseForDispute({
  dispute,
  actorId,
  correlationId,
  sourceReference,
}) {
  return caseDb.withTransaction(async (client) => {
    const caseId = newId();

    await client.query(
      `
        INSERT INTO cases (
          id,
          domain,
          origin,
          state,
          priority,
          severity,
          title,
          summary,
          business_id,
          user_id,
          source_system,
          source_reference,
          external_object_type,
          external_object_id,
          dedupe_key,
          idempotency_key,
          correlation_id,
          request_id,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          'disputes',
          'user_report',
          'open',
          'normal',
          'medium',
          $2,
          $3,
          NULL,
          $4,
          'gateway-api',
          $5,
          'card_dispute',
          $6,
          $7,
          $8,
          $9,
          NULL,
          $10,
          $10
        )
      `,
      [
        caseId,
        'Card dispute opened',
        'Customer opened a dispute for a card transaction',
        actorId,
        sourceReference,
        dispute.id,
        `card_dispute:${dispute.id}`,
        `case:${dispute.idempotencyKey}`,
        correlationId,
        actorId,
      ]
    );

    await client.query(
      `
        INSERT INTO case_timeline (
          id,
          case_id,
          event_type,
          actor_type,
          actor_id,
          visible_to_customer,
          entry_text,
          metadata,
          idempotency_key,
          correlation_id,
          request_id
        )
        VALUES (
          $1,
          $2,
          'case_created',
          'system',
          $3,
          false,
          $4,
          $5::jsonb,
          $6,
          $7,
          NULL
        )
      `,
      [
        newId(),
        caseId,
        actorId,
        'Dispute case opened from cards disputes API',
        JSON.stringify({
          dispute_id: dispute.id,
          card_id: dispute.cardId,
          reason_code: dispute.reasonCode,
        }),
        `timeline:${dispute.idempotencyKey}`,
        correlationId,
      ]
    );

    return { id: caseId };
  });
}

// IMPORTANTE:
// Ajusta esta función cuando confirmes el nombre real de la tabla de inbox.
// El flujo ya queda correcto; sólo puede requerir cambiar tabla/columnas.
async function createInboxMessage({
  spaceId,
  dispute,
  caseId,
  correlationId,
}) {
  const inboxMessageId = newId();

  await financialDb.query(
    `
      INSERT INTO ops.financial_inbox_messages (
        id,
        space_uuid,
        type,
        payload,
        correlation_id,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4::jsonb,
        $5,
        now()
      )
    `,
    [
      inboxMessageId,
      spaceId,
      'card_dispute_opened',
      JSON.stringify({
        dispute_id: dispute.id,
        case_id: caseId,
        card_id: dispute.cardId,
        reason_code: dispute.reasonCode,
        status: dispute.status,
      }),
      correlationId,
    ]
  );

  return { id: inboxMessageId };
}

async function attachCaseToDispute(disputeId, caseId) {
  return cardsDb.withTransaction(async (client) => {
    return cardDisputesRepo.attachCase(client, {
      disputeId,
      caseId,
    });
  });
}

async function attachInboxMessageToDispute(disputeId, inboxMessageId) {
  return cardsDb.withTransaction(async (client) => {
    return cardDisputesRepo.attachInboxMessage(client, {
      disputeId,
      inboxMessageId,
    });
  });
}

router.post('/disputes', async (req, res, next) => {
  const idempotencyKey = readRequiredHeader(req, 'Idempotency-Key');
  const correlationId = readRequiredHeader(req, 'X-Correlation-Id') || newId();
  const actorId =
    readRequiredHeader(req, 'X-Actor-Id') ||
    '00000000-0000-0000-0000-000000000000';
  const spaceId = readRequiredHeader(req, 'X-Space-Id');

  const {
    card_id,
    authorization_id,
    capture_id,
    settlement_id,
    reason_code,
    description,
  } = req.body || {};

  try {
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'missing_idempotency_key' });
    }

    if (!spaceId) {
      return res.status(400).json({ error: 'missing_space_id' });
    }

    if (!card_id || !reason_code) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    if (!authorization_id && !capture_id && !settlement_id) {
      return res.status(400).json({ error: 'missing_transaction_reference' });
    }

    const card = await cardsRepo.findById(card_id);
    if (!card) {
      return res.status(404).json({ error: 'card_not_found' });
    }

    if (String(card.space_uuid) !== String(spaceId)) {
      return res.status(409).json({ error: 'space_card_mismatch' });
    }

    if (authorization_id) {
      const authorization = await cardAuthorizationsRepo.findById(
        cardsDb,
        authorization_id
      );

      if (!authorization) {
        return res.status(404).json({ error: 'authorization_not_found' });
      }

      if (
        String(authorization.cardId) !== String(card_id) ||
        String(authorization.spaceId) !== String(spaceId)
      ) {
        return res.status(409).json({ error: 'authorization_mismatch' });
      }
    }

    let createdFresh = false;

    let dispute = await cardsDb.withTransaction(async (client) => {
      const replay = await cardDisputesRepo.findByIdempotencyKey(
        client,
        idempotencyKey
      );

      if (replay) {
        return replay;
      }

      createdFresh = true;

      const created = await cardDisputesRepo.createDispute(client, {
        id: newId(),
        spaceId,
        cardId: card_id,
        authorizationId: toNullableString(authorization_id),
        captureId: toNullableString(capture_id),
        settlementId: toNullableString(settlement_id),
        reasonCode: reason_code,
        description: toNullableString(description),
        openedByUserId: actorId,
        idempotencyKey,
        correlationId,
        requestPayload: req.body || {},
      });

      await cardsOutboxRepo.appendEvent(client, {
        aggregateType: 'card_dispute',
        aggregateId: created.id,
        eventType: 'card.dispute.opened.v1',
        payload: {
          dispute_id: created.id,
          space_id: created.spaceId,
          card_id: created.cardId,
          authorization_id: created.authorizationId,
          capture_id: created.captureId,
          settlement_id: created.settlementId,
          reason_code: created.reasonCode,
          status: created.status,
        },
        correlationId,
        idempotencyKey,
      });

      return created;
    });

    // Completar / reparar case si falta
    if (!dispute.caseId) {
      const caseRecord = await createCaseForDispute({
        dispute,
        actorId,
        correlationId,
        sourceReference:
          authorization_id || capture_id || settlement_id || null,
      });

      dispute = await attachCaseToDispute(dispute.id, caseRecord.id);
    }

    // Completar / reparar inbox si falta
    if (!dispute.inboxMessageId) {
      const inboxRecord = await createInboxMessage({
        spaceId,
        dispute,
        caseId: dispute.caseId,
        correlationId,
      });

      dispute = await attachInboxMessageToDispute(dispute.id, inboxRecord.id);
    }

    return res.status(createdFresh ? 201 : 200).json({
      dispute_id: dispute.id,
      status: dispute.status,
      case_id: dispute.caseId,
      inbox_message_id: dispute.inboxMessageId,
      event_type: 'card.dispute.opened.v1',
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;