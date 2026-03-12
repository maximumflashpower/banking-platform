'use strict';

const { createHash } = require('crypto');

const cardsWebhookEventsRepo = require('../../../repos/cards/cardsWebhookEventsRepo');
const cardsOutboxRepo = require('../../../repos/cards/cardsOutboxRepo');
const cardAuthorizationsRepo = require('../../../repos/cards/cardAuthorizationsRepo');
const spaceStateReaderRepo = require('../../../repos/cards/spaceStateReaderRepo');
const availableBalanceReaderRepo = require('../../../repos/cards/availableBalanceReaderRepo');
const { evaluateRisk } = require('./riskClient');

function normalizeCurrency(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePayload(payload = {}) {
  return {
    provider: payload.provider || 'internal',
    providerEventId: payload.providerEventId || payload.provider_event_id || null,
    providerAuthId: payload.providerAuthId || payload.provider_auth_id || null,
    cardId: payload.cardId || payload.card_id || null,
    spaceId: payload.spaceId || payload.space_id || payload.space_uuid || null,
    amount: payload.amount === undefined || payload.amount === null ? null : Number(payload.amount),
    currency: normalizeCurrency(payload.currency || 'USD'),
    merchantName: payload.merchantName || payload.merchant_name || null,
    merchantMcc: payload.merchantMcc || payload.merchant_mcc || null,
    idempotencyKey: payload.idempotencyKey || payload.idempotency_key || null,
    rawPayload: payload,
  };
}

function buildIdempotencyKey(input) {
  if (input.idempotencyKey) return String(input.idempotencyKey);

  const stable = {
    provider: input.provider,
    providerAuthId: input.providerAuthId,
    cardId: input.cardId,
    amount: Number(input.amount || 0),
    currency: normalizeCurrency(input.currency),
    merchantName: input.merchantName,
    merchantMcc: input.merchantMcc,
  };

  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function buildHoldRef(record) {
  return `card_auth:${record.id}`;
}

function buildNonPersistedResponse(input, overrides = {}, meta = {}) {
  return {
    authorizationId: null,
    cardId: input.cardId,
    spaceId: input.spaceId || null,
    provider: input.provider,
    providerAuthId: input.providerAuthId,
    idempotencyKey: meta.idempotencyKey || null,
    status: 'not_persisted',
    decision: overrides.decision || 'decline',
    declineReason: overrides.declineReason || 'INVALID_REQUEST',
    riskStatus: overrides.riskStatus || 'not_requested',
    availableBalanceSnapshot: overrides.availableBalanceSnapshot ?? null,
    ledgerHoldId: null,
    ledgerHoldRef: null,
    holdStatus: null,
    amount: input.amount,
    currency: input.currency,
    merchantName: input.merchantName,
    merchantMcc: input.merchantMcc,
    idempotentReplay: meta.idempotentReplay === true,
    webhookReplay: meta.webhookReplay === true,
    createdAt: null,
    decisionedAt: new Date().toISOString(),
  };
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
    ledgerHoldId: record.ledgerHoldId || null,
    ledgerHoldRef: record.ledgerHoldRef || null,
    holdStatus: record.holdStatus || null,
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

function emitRiskMonitoringEvent({ cardId, authId, riskScore, reason }) {
  console.log(
    JSON.stringify({
      event: 'risk_monitoring_event',
      card_id: cardId,
      auth_id: authId,
      risk_score: Number.isFinite(Number(riskScore)) ? Number(riskScore) : 0,
      reason: reason || 'unspecified',
      timestamp: new Date().toISOString(),
    })
  );
}

async function maybeRepairApprovedAuthorization(cardsDb, financialDb, existing) {
  if (!existing) {
    return existing;
  }

  if (existing.decision !== 'approve') {
    return existing;
  }

  if (existing.ledgerHoldId && existing.ledgerHoldRef) {
    return existing;
  }

  const balance = await availableBalanceReaderRepo.getAvailableBalance(
    financialDb,
    existing.spaceId,
    existing.currency
  );

  const ledgerAccountId = balance.accountId || null;

  return maybeCreateLedgerHold(cardsDb, existing, ledgerAccountId);
}

async function insertOutbox(cardsDb, eventType, payload) {
  if (!payload.authorizationId) return null;

  return cardsOutboxRepo.appendEvent(cardsDb, {
    aggregateType: 'card_authorization',
    aggregateId: payload.authorizationId,
    eventType,
    payload,
    correlationId: null,
    idempotencyKey: payload.idempotencyKey || null,
  });
}

async function recordWebhookIfPresent(cardsDb, input) {
  if (!input.providerEventId) {
    return { inserted: false };
  }

  if (typeof cardsWebhookEventsRepo.insertIfAbsent === 'function') {
    return cardsWebhookEventsRepo.insertIfAbsent(cardsDb, {
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: 'authorization_received',
      payload: input.rawPayload || input,
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
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4::jsonb,
        NOW()
      )
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
    `,
    [
      input.provider,
      input.providerEventId,
      'authorization_received',
      JSON.stringify(input.rawPayload || input),
    ]
  );

  return { inserted: result.rowCount > 0 };
}

async function getCard(cardsDb, cardId) {
  if (!cardId) return null;

  const result = await cardsDb.query(
    `
      SELECT
        id,
        space_uuid,
        status,
        freeze_reason
      FROM cards
      WHERE id = $1
      LIMIT 1
    `,
    [cardId]
  );

  return result.rows[0]
    ? {
        id: result.rows[0].id,
        spaceId: result.rows[0].space_uuid || null,
        status: result.rows[0].status,
        freezeReason: result.rows[0].freeze_reason || null,
      }
    : null;
}

async function persistDecision(cardsDb, input) {
  const inserted = await cardAuthorizationsRepo.insertDecisionedAuthorization(cardsDb, input);
  return inserted || (await cardAuthorizationsRepo.findByIdempotencyKey(cardsDb, input.idempotencyKey));
}

async function maybeCreateLedgerHold(cardsDb, persisted, accountId) {
  if (persisted.decision !== 'approve') {
    return persisted;
  }

  if (persisted.ledgerHoldId && persisted.ledgerHoldRef) {
    return persisted;
  }

  if (!accountId) {
    throw new Error('ledger_hold_create_failed:missing_account_id');
  }

  const holdRef = persisted.ledgerHoldRef || buildHoldRef(persisted);

  const response = await fetch(
    'http://localhost:3000/internal/v1/ledger/holds/create',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        accountId,
        spaceId: persisted.spaceId,
        holdRef,
        externalRef: persisted.providerAuthId || persisted.id,
        amount: persisted.amount,
        currency: persisted.currency,
        reason: 'card_authorization',
        metadata: {
          authorizationId: persisted.id,
          cardId: persisted.cardId,
          provider: persisted.provider,
          providerAuthId: persisted.providerAuthId,
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ledger_hold_create_failed:${response.status}:${text}`);
  }

  const data = await response.json();

  const holdId =
    data?.hold?.id ||
    data?.data?.hold?.id ||
    data?.data?.holdId ||
    data?.holdId ||
    persisted.ledgerHoldId ||
    null;

  const holdRefResp =
    data?.hold?.hold_ref ||
    data?.hold?.holdRef ||
    data?.data?.hold?.hold_ref ||
    data?.data?.hold?.holdRef ||
    data?.data?.holdRef ||
    data?.holdRef ||
    persisted.ledgerHoldRef ||
    holdRef;

  const holdStatus =
    data?.hold?.status ||
    data?.data?.hold?.status ||
    data?.data?.status ||
    data?.status ||
    persisted.holdStatus ||
    'active';

  const updated = await cardAuthorizationsRepo.attachLedgerHold(cardsDb, {
    authorizationId: persisted.id,
    ledgerHoldId: holdId,
    ledgerHoldRef: holdRefResp,
    holdStatus,
  });

  return updated || persisted;
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
    ledgerHoldId: persisted.ledgerHoldId || null,
    ledgerHoldRef: persisted.ledgerHoldRef || null,
    holdStatus: persisted.holdStatus || null,
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
  const input = normalizePayload(payload);
  const idempotencyKey = buildIdempotencyKey(input);

  if (!input.cardId || !Number.isFinite(input.amount) || input.amount <= 0 || !input.currency) {
    return buildNonPersistedResponse(
      input,
      {
        decision: 'decline',
        declineReason: 'INVALID_REQUEST',
        riskStatus: 'not_requested',
      },
      { idempotencyKey }
    );
  }

  const existingByKey = await cardAuthorizationsRepo.findByIdempotencyKey(cardsDb, idempotencyKey);
  if (existingByKey) {
    const repaired = await maybeRepairApprovedAuthorization(cardsDb, financialDb, existingByKey);
    return toApiResponse(repaired, { idempotentReplay: true });
  }

  if (input.providerAuthId) {
    const existingByProviderAuth = await cardAuthorizationsRepo.findByProviderAuthId(
      cardsDb,
      input.provider,
      input.providerAuthId
    );

    if (existingByProviderAuth) {
      const repaired = await maybeRepairApprovedAuthorization(
        cardsDb,
        financialDb,
        existingByProviderAuth
      );

      return toApiResponse(repaired, {
        idempotentReplay: true,
        webhookReplay: true,
      });
    }
  }

  const webhookResult = await recordWebhookIfPresent(cardsDb, input);

  if (input.providerEventId && webhookResult.inserted === false) {
    const replayByProviderAuth = input.providerAuthId
      ? await cardAuthorizationsRepo.findByProviderAuthId(cardsDb, input.provider, input.providerAuthId)
      : await cardAuthorizationsRepo.findByIdempotencyKey(cardsDb, idempotencyKey);

    if (replayByProviderAuth) {
      const repaired = await maybeRepairApprovedAuthorization(
        cardsDb,
        financialDb,
        replayByProviderAuth
      );

      return toApiResponse(repaired, {
        idempotentReplay: true,
        webhookReplay: true,
      });
    }
  }

  const card = await getCard(cardsDb, input.cardId);

  if (!card) {
    return buildNonPersistedResponse(
      input,
      {
        decision: 'decline',
        declineReason: 'CARD_NOT_FOUND',
        riskStatus: 'not_requested',
      },
      { idempotencyKey }
    );
  }

  const spaceId = card.spaceId || input.spaceId || null;

  if (!spaceId) {
    return buildNonPersistedResponse(
      input,
      {
        decision: 'decline',
        declineReason: 'SPACE_CONTEXT_MISSING',
        riskStatus: 'not_requested',
      },
      { idempotencyKey }
    );
  }

  let decision = 'approve';
  let declineReason = null;
  let riskStatus = 'not_requested';
  let availableBalanceSnapshot = null;
  let ledgerAccountId = null;
  let riskScore = 0;
  let riskReason = null;
  let shouldEmitMonitoringEvent = false;

  if (String(card.status || '').toLowerCase() === 'frozen') {
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
    ledgerAccountId = balance.accountId || null;

    if (Number(balance.availableBalance) < Number(input.amount)) {
      decision = 'decline';
      declineReason = 'INSUFFICIENT_AVAILABLE_BALANCE';
    }
  }

  if (decision === 'approve') {
    const riskResult = await evaluateRisk({
      cardId: input.cardId,
      spaceId,
      amount: Number(input.amount),
      currency: normalizeCurrency(input.currency),
      merchantName: input.merchantName,
      merchantMcc: input.merchantMcc,
      provider: input.provider,
      providerAuthId: input.providerAuthId,
      idempotencyKey,
    });

    riskScore = riskResult.score;
    riskReason = riskResult.reason;

    if (riskResult.decision === 'block_tx') {
      decision = 'decline';
      declineReason = 'RISK_BLOCK_TX';
      riskStatus = 'block_tx';
    } else if (riskResult.decision === 'allow_with_monitoring') {
      decision = 'approve';
      riskStatus = 'allow_with_monitoring';
      shouldEmitMonitoringEvent = true;
    } else {
      decision = 'approve';
      riskStatus = 'allow';
    }
  }

  let persisted = await persistDecision(cardsDb, {
    cardId: card.id,
    spaceId,
    provider: input.provider,
    providerAuthId: input.providerAuthId,
    idempotencyKey,
    amount: Number(input.amount),
    currency: normalizeCurrency(input.currency),
    merchantName: input.merchantName,
    merchantMcc: input.merchantMcc,
    decision,
    declineReason,
    riskStatus,
    availableBalanceSnapshot,
    requestPayload: input.rawPayload,
  });

  if (persisted.decision === 'approve') {
    persisted = await maybeCreateLedgerHold(cardsDb, persisted, ledgerAccountId);
  }

  if (shouldEmitMonitoringEvent) {
    emitRiskMonitoringEvent({
      cardId: persisted.cardId,
      authId: persisted.id,
      riskScore,
      reason: riskReason,
    });
  }

  await publishDecisionOutbox(cardsDb, persisted);

  return toApiResponse(persisted);
}

module.exports = {
  decideAuthorization,
};