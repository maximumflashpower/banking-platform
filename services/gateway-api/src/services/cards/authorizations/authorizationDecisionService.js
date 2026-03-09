'use strict';

const { createHash, randomUUID } = require('crypto');

const cardsRepo = require('../../../repos/cards/cardsRepo');
const cardsWebhookEventsRepo = require('../../../repos/cards/cardsWebhookEventsRepo');
const cardsOutboxRepo = require('../../../repos/cards/cardsOutboxRepo');
const cardAuthorizationsRepo = require('../../../repos/cards/cardAuthorizationsRepo');
const spaceStateReaderRepo = require('../../../repos/cards/spaceStateReaderRepo');
const availableBalanceReaderRepo = require('../../../repos/cards/availableBalanceReaderRepo');
const { evaluateRisk } = require('./riskClient');

function normalizeCurrency(value) {
  return String(value || '').trim().toUpperCase();
}

function buildIdempotencyKey(payload) {
  if (payload.idempotencyKey) return payload.idempotencyKey;

  const stable = {
    provider: payload.provider || 'internal',
    providerAuthId: payload.providerAuthId || null,
    cardId: payload.cardId,
    amount: Number(payload.amount),
    currency: normalizeCurrency(payload.currency),
    merchantName: payload.merchantName || null,
    merchantMcc: payload.merchantMcc || null,
  };

  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function toApiResponse(record, meta = {}) {
  return {
    authorizationId: record.id,
    cardId: record.cardId,
    spaceId: record.spaceId,
    provider: record.provider,
    providerAuthId: record.providerAuthId,
    idempotencyKey: record.idempotencyKey,
    status: record.status,
    decision: record.decision,
    declineReason: record.declineReason,
    riskStatus: record.riskStatus,
    availableBalanceSnapshot: record.availableBalanceSnapshot,
    amount: record.amount,
    currency: record.currency,
    merchantName: record.merchantName,
    merchantMcc: record.merchantMcc,
    idempotentReplay: meta.idempotentReplay === true,
    webhookReplay: meta.webhookReplay === true,
    createdAt: record.createdAt,
    decisionedAt: record.decisionedAt,
  };
}

async function insertOutbox(cardsDb, eventType, payload) {
  return cardsOutboxRepo.appendEvent(cardsDb, {
    aggregateType: 'card_authorization',
    aggregateId: payload.authorizationId,
    eventType,
    payload,
    correlationId: null,
    idempotencyKey: payload.idempotencyKey || null,
  });
}

async function recordWebhookIfPresent(cardsDb, payload) {
  if (!payload.providerEventId) {
    return { inserted: false };
  }

  if (typeof cardsWebhookEventsRepo.insertIfAbsent === 'function') {
    return cardsWebhookEventsRepo.insertIfAbsent(cardsDb, {
      provider: payload.provider,
      providerEventId: payload.providerEventId,
      eventType: 'authorization_received',
      payload: payload.rawPayload || payload,
    });
  }

  const result = await cardsDb.query(
    `
      INSERT INTO cards_webhook_events (
        id,
        provider,
        provider_event_id,
        event_type,
        payload,
        received_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
    `,
    [
      randomUUID(),
      payload.provider,
      payload.providerEventId,
      'authorization_received',
      JSON.stringify(payload.rawPayload || payload),
    ]
  );

  return { inserted: result.rowCount > 0 };
}

async function getCard(cardsDb, cardId) {
  if (typeof cardsRepo.findById === 'function') {
    const card = await cardsRepo.findById(cardId);
    if (!card) return null;

    return {
      id: card.id,
      spaceId: card.space_uuid || card.spaceId || null,
      status: card.status,
    };
  }

  const result = await cardsDb.query(
    `
      SELECT *
      FROM cards
      WHERE id = $1
      LIMIT 1
    `,
    [cardId]
  );

  return result.rows[0]
    ? {
        id: result.rows[0].id,
        spaceId: result.rows[0].space_uuid || result.rows[0].space_id || null,
        status: result.rows[0].status,
      }
    : null;
}

async function persistDecision(cardsDb, input) {
  const inserted = await cardAuthorizationsRepo.insertDecisionedAuthorization(cardsDb, input);

  return inserted || (await cardAuthorizationsRepo.findByIdempotencyKey(cardsDb, input.idempotencyKey));
}

async function publishDecisionOutbox(cardsDb, persisted) {
  const baseEventPayload = {
    authorizationId: persisted.id,
    cardId: persisted.cardId,
    spaceId: persisted.spaceId,
    provider: persisted.provider,
    providerAuthId: persisted.providerAuthId,
    idempotencyKey: persisted.idempotencyKey,
    amount: persisted.amount,
    currency: persisted.currency,
    merchantName: persisted.merchantName,
    merchantMcc: persisted.merchantMcc,
    decision: persisted.decision,
    declineReason: persisted.declineReason,
    riskStatus: persisted.riskStatus,
    availableBalanceSnapshot: persisted.availableBalanceSnapshot,
    occurredAt: persisted.decisionedAt,
  };

  await insertOutbox(cardsDb, 'card.auth.received.v1', baseEventPayload);

  if (persisted.decision === 'approve') {
    await insertOutbox(cardsDb, 'card.auth.approved.v1', baseEventPayload);
  } else {
    await insertOutbox(cardsDb, 'card.auth.declined.v1', baseEventPayload);
  }
}

async function decideAuthorization({ cardsDb, financialDb, payload }) {
  const provider = payload.provider || 'internal';
  const idempotencyKey = buildIdempotencyKey(payload);
  const providerAuthId = payload.providerAuthId || null;

  if (!payload.cardId || !payload.amount || !payload.currency) {
    const persisted = await persistDecision(cardsDb, {
      cardId: payload.cardId || randomUUID(),
      spaceId: payload.spaceId || randomUUID(),
      provider,
      providerAuthId,
      idempotencyKey,
      amount: Number(payload.amount || 0),
      currency: normalizeCurrency(payload.currency || 'USD'),
      merchantName: payload.merchantName || null,
      merchantMcc: payload.merchantMcc || null,
      decision: 'decline',
      declineReason: 'INVALID_REQUEST',
      riskStatus: 'not_requested',
      availableBalanceSnapshot: null,
      requestPayload: payload,
    });

    await publishDecisionOutbox(cardsDb, persisted);
    return toApiResponse(persisted);
  }

  const existingByKey = await cardAuthorizationsRepo.findByIdempotencyKey(cardsDb, idempotencyKey);
  if (existingByKey) {
    return toApiResponse(existingByKey, { idempotentReplay: true });
  }

  if (providerAuthId) {
    const existingByProviderAuth = await cardAuthorizationsRepo.findByProviderAuthId(
      cardsDb,
      provider,
      providerAuthId
    );

    if (existingByProviderAuth) {
      return toApiResponse(existingByProviderAuth, {
        idempotentReplay: true,
        webhookReplay: true,
      });
    }
  }

  const webhookResult = await recordWebhookIfPresent(cardsDb, {
    provider,
    providerEventId: payload.providerEventId,
    rawPayload: payload,
  });

  if (payload.providerEventId && webhookResult.inserted === false) {
    const replayByProviderAuth = providerAuthId
      ? await cardAuthorizationsRepo.findByProviderAuthId(cardsDb, provider, providerAuthId)
      : await cardAuthorizationsRepo.findByIdempotencyKey(cardsDb, idempotencyKey);

    if (replayByProviderAuth) {
      return toApiResponse(replayByProviderAuth, {
        idempotentReplay: true,
        webhookReplay: true,
      });
    }
  }

  const card = await getCard(cardsDb, payload.cardId);

  if (!card) {
    const persisted = await persistDecision(cardsDb, {
      cardId: payload.cardId,
      spaceId: payload.spaceId || randomUUID(),
      provider,
      providerAuthId,
      idempotencyKey,
      amount: Number(payload.amount),
      currency: normalizeCurrency(payload.currency),
      merchantName: payload.merchantName || null,
      merchantMcc: payload.merchantMcc || null,
      decision: 'decline',
      declineReason: 'CARD_NOT_FOUND',
      riskStatus: 'not_requested',
      availableBalanceSnapshot: null,
      requestPayload: payload,
    });

    await publishDecisionOutbox(cardsDb, persisted);
    return toApiResponse(persisted);
  }

  const spaceId = card.spaceId || payload.spaceId || null;

  if (!spaceId) {
    const persisted = await persistDecision(cardsDb, {
      cardId: payload.cardId,
      spaceId: randomUUID(),
      provider,
      providerAuthId,
      idempotencyKey,
      amount: Number(payload.amount),
      currency: normalizeCurrency(payload.currency),
      merchantName: payload.merchantName || null,
      merchantMcc: payload.merchantMcc || null,
      decision: 'decline',
      declineReason: 'SPACE_CONTEXT_MISSING',
      riskStatus: 'not_requested',
      availableBalanceSnapshot: null,
      requestPayload: payload,
    });

    await publishDecisionOutbox(cardsDb, persisted);
    return toApiResponse(persisted);
  }

  let decision = 'approve';
  let declineReason = null;
  let riskStatus = 'not_requested';
  let availableBalanceSnapshot = null;

  if (String(card.status).toLowerCase() === 'frozen') {
    decision = 'decline';
    declineReason = 'CARD_FROZEN';
  }

  if (decision === 'approve') {
    const spaceState = await spaceStateReaderRepo.getSpaceFreezeState(financialDb, spaceId);
    if (spaceState.isFrozen) {
      decision = 'decline';
      declineReason = 'SPACE_FROZEN';
    }
  }

  if (decision === 'approve') {
    const balance = await availableBalanceReaderRepo.getAvailableBalance(financialDb, spaceId);
    availableBalanceSnapshot = balance.availableBalance;

    if (Number(balance.availableBalance) < Number(payload.amount)) {
      decision = 'decline';
      declineReason = 'INSUFFICIENT_AVAILABLE_BALANCE';
    }
  }

  if (decision === 'approve') {
    const riskResult = await evaluateRisk({
      flow: 'card_authorization',
      cardId: payload.cardId,
      spaceId,
      amount: Number(payload.amount),
      currency: normalizeCurrency(payload.currency),
      merchantName: payload.merchantName || null,
      merchantMcc: payload.merchantMcc || null,
      provider,
      providerAuthId,
      idempotencyKey,
    });

    if (!riskResult.ok) {
      decision = 'decline';
      declineReason = 'RISK_UNAVAILABLE';
      riskStatus = riskResult.status;
    } else if (riskResult.status === 'declined') {
      decision = 'decline';
      declineReason = 'RISK_DECLINED';
      riskStatus = 'declined';
    } else {
      riskStatus = 'approved';
    }
  }

  const persisted = await persistDecision(cardsDb, {
    cardId: payload.cardId,
    spaceId,
    provider,
    providerAuthId,
    idempotencyKey,
    amount: Number(payload.amount),
    currency: normalizeCurrency(payload.currency),
    merchantName: payload.merchantName || null,
    merchantMcc: payload.merchantMcc || null,
    decision,
    declineReason,
    riskStatus,
    availableBalanceSnapshot,
    requestPayload: payload,
  });

  await publishDecisionOutbox(cardsDb, persisted);

  return toApiResponse(persisted);
}

module.exports = {
  decideAuthorization,
};
