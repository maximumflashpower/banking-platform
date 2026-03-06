'use strict';

const crypto = require('crypto');
const financialDb = require('../../../infrastructure/financialDb');
const { DOMAIN_STATES, mapProviderStatusToDomain } = require('./statusMapping');

const WEBHOOK_PROCESSING_STATUS = Object.freeze({
  STORED: 'stored',
  PROCESSED: 'processed',
  DUPLICATE: 'duplicate',
  IGNORED_UNKNOWN_STATUS: 'ignored_unknown_status',
  IGNORED_UNRESOLVED_TRANSFER: 'ignored_unresolved_transfer',
  IGNORED_TERMINAL_STATE: 'ignored_terminal_state',
  ERROR: 'error',
});

const TERMINAL_STATES = new Set([
  DOMAIN_STATES.SETTLED,
  DOMAIN_STATES.RETURNED,
  DOMAIN_STATES.FAILED,
]);

function buildError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeJson(value) {
  return JSON.stringify(value ?? {});
}

function nowUtcIso() {
  return new Date().toISOString();
}

function normalizeProvider(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function assertPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw buildError('payload must be a JSON object');
  }

  if (!payload.provider) throw buildError('missing required field: provider');
  if (!payload.provider_event_id) throw buildError('missing required field: provider_event_id');
  if (!payload.event_type) throw buildError('missing required field: event_type');
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw buildError('missing required field: data');
  }
  if (!payload.data.provider_transfer_id) {
    throw buildError('missing required field: data.provider_transfer_id');
  }
  if (!payload.data.status) {
    throw buildError('missing required field: data.status');
  }
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateSignatureIfApplicable(payload, rawBody) {
  const provider = normalizeProvider(payload.provider);

  if (provider !== 'mock_ach') {
    return { checked: false, valid: null, reason: 'provider_without_signature_validation' };
  }

  const secret = process.env.MOCK_ACH_WEBHOOK_SECRET;
  if (!secret) {
    return { checked: false, valid: null, reason: 'no_secret_configured' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody || safeJson(payload))
    .digest('hex');

  const received = payload.signature || '';
  const valid = timingSafeEqualText(received, expected);

  return {
    checked: true,
    valid,
    reason: valid ? null : 'signature_mismatch',
  };
}

async function withDbClient(work) {
  if (financialDb && typeof financialDb.connect === 'function') {
    const client = await financialDb.connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  if (financialDb && typeof financialDb.query === 'function') {
    const pseudoClient = {
      query: (...args) => financialDb.query(...args),
      release: () => {},
    };
    return await work(pseudoClient);
  }

  throw new Error('financialDb adapter is not compatible: expected connect() or query()');
}

async function getWebhookEventByProviderEventId(client, provider, providerEventId) {
  const result = await client.query(
    `
      SELECT *
      FROM rails_webhook_events
      WHERE provider = $1
        AND provider_event_id = $2
      LIMIT 1
    `,
    [provider, providerEventId]
  );

  return result.rows[0] || null;
}

async function insertWebhookEvent(client, payload, signatureValidation) {
  const result = await client.query(
    `
      INSERT INTO rails_webhook_events (
        provider,
        provider_event_id,
        event_type,
        payload,
        signature,
        signature_valid,
        processing_status,
        received_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
    `,
    [
      payload.provider,
      payload.provider_event_id,
      payload.event_type,
      safeJson(payload),
      payload.signature || null,
      signatureValidation.valid,
      WEBHOOK_PROCESSING_STATUS.STORED,
    ]
  );

  return {
    stored: result.rowCount === 1,
    id: result.rows[0]?.id || null,
  };
}

async function updateWebhookEvent(client, eventId, fields) {
  const result = await client.query(
    `
      UPDATE rails_webhook_events
      SET
        signature_valid = COALESCE($2, signature_valid),
        processing_status = COALESCE($3, processing_status),
        error_message = $4,
        payment_intent_id = COALESCE($5, payment_intent_id),
        transfer_id = COALESCE($6, transfer_id),
        settlement_applied = COALESCE($7, settlement_applied),
        processed_at = COALESCE($8, processed_at),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      eventId,
      Object.prototype.hasOwnProperty.call(fields, 'signatureValid') ? fields.signatureValid : null,
      fields.processingStatus || null,
      Object.prototype.hasOwnProperty.call(fields, 'errorMessage') ? fields.errorMessage : null,
      fields.paymentIntentId || null,
      fields.transferId || null,
      Object.prototype.hasOwnProperty.call(fields, 'settlementApplied')
        ? fields.settlementApplied
        : null,
      fields.processedAt || null,
    ]
  );

  return result.rows[0] || null;
}

async function resolveAchTransfer(client, provider, providerTransferId) {
  const result = await client.query(
    `
      SELECT id, payment_intent_id, provider, provider_transfer_id
      FROM rails_transfers_ach
      WHERE provider = $1
        AND provider_transfer_id = $2
      LIMIT 1
    `,
    [provider, providerTransferId]
  );

  return result.rows[0] || null;
}

async function getCurrentIntentState(client, paymentIntentId) {
  const result = await client.query(
    `
      SELECT state
      FROM current_payment_intents
      WHERE id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return result.rows[0]?.state || null;
}

async function intentStateExists(client, paymentIntentId, state) {
  const result = await client.query(
    `
      SELECT 1
      FROM payment_intent_states
      WHERE payment_intent_id = $1
        AND state = $2
      LIMIT 1
    `,
    [paymentIntentId, state]
  );

  return result.rowCount > 0;
}

async function insertIntentState(client, paymentIntentId, state, details = {}) {
  await client.query(
    `
      INSERT INTO payment_intent_states (
        payment_intent_id,
        state,
        reason_code,
        reason_detail,
        correlation_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `,
    [
      paymentIntentId,
      state,
      details.reasonCode || null,
      details.reasonDetail || null,
      details.correlationId || `ach_webhook_${state}`,
    ]
  );
}

function isAllowedTransition(currentState, nextState) {
  if (!nextState) return false;
  if (!currentState) return nextState === DOMAIN_STATES.SUBMITTED;
  if (currentState === nextState) return true;

  if (currentState === DOMAIN_STATES.SETTLED) return false;
  if (currentState === DOMAIN_STATES.RETURNED) return false;
  if (currentState === DOMAIN_STATES.FAILED) return false;

  const allowed = {
    [DOMAIN_STATES.SUBMITTED]: new Set([
      DOMAIN_STATES.PROCESSING,
      DOMAIN_STATES.SETTLED,
      DOMAIN_STATES.RETURNED,
      DOMAIN_STATES.FAILED,
    ]),
    [DOMAIN_STATES.PROCESSING]: new Set([
      DOMAIN_STATES.SETTLED,
      DOMAIN_STATES.RETURNED,
      DOMAIN_STATES.FAILED,
    ]),
  };

  return allowed[currentState]?.has(nextState) || false;
}

async function applySettlementOnce(client, paymentIntentId, transferId) {
  const settledAlready = await intentStateExists(client, paymentIntentId, DOMAIN_STATES.SETTLED);
  if (settledAlready) {
    return { applied: false, reason: 'already_settled' };
  }

    await insertIntentState(client, paymentIntentId, DOMAIN_STATES.SETTLED, {
    reasonCode: 'provider_settled',
    reasonDetail: `transfer_id=${transferId}; settled_at=${nowUtcIso()}`,
    correlationId: `ach_webhook_settled_${transferId}`,
  });

  return { applied: true, reason: null };
}

async function markExistingWebhookAsError(provider, providerEventId, message) {
  try {
    return await withDbClient(async (client) => {
      const existing = await getWebhookEventByProviderEventId(client, provider, providerEventId);

      if (!existing) {
        return null;
      }

      return updateWebhookEvent(client, existing.id, {
        processingStatus: WEBHOOK_PROCESSING_STATUS.ERROR,
        errorMessage: message,
        processedAt: new Date(),
      });
    });
  } catch (_repairError) {
    return null;
  }
}

async function processAchWebhook({ payload, rawBody }) {
  assertPayload(payload);

  const provider = payload.provider;
  const providerEventId = payload.provider_event_id;
  const providerTransferId = payload.data.provider_transfer_id;
  const providerStatus = payload.data.status;

  const signatureValidation = validateSignatureIfApplicable(payload, rawBody);

  try {
    return await withDbClient(async (client) => {
      await client.query('BEGIN');

      try {
        const insertResult = await insertWebhookEvent(client, payload, signatureValidation);

        if (!insertResult.stored) {
          const existing = await getWebhookEventByProviderEventId(client, provider, providerEventId);

          if (existing) {
            await updateWebhookEvent(client, existing.id, {
              processingStatus: WEBHOOK_PROCESSING_STATUS.DUPLICATE,
            });
          }

          await client.query('COMMIT');

          return {
            ok: true,
            provider,
            provider_event_id: providerEventId,
            stored: false,
            processed: false,
            idempotent: true,
          };
        }

        const event = await getWebhookEventByProviderEventId(client, provider, providerEventId);

        if (signatureValidation.checked && signatureValidation.valid === false) {
          await updateWebhookEvent(client, event.id, {
            signatureValid: false,
            processingStatus: WEBHOOK_PROCESSING_STATUS.ERROR,
            errorMessage: 'signature validation failed',
            processedAt: new Date(),
          });

          await client.query('COMMIT');

          return {
            ok: false,
            provider,
            provider_event_id: providerEventId,
            stored: true,
            processed: false,
            idempotent: false,
            error: 'signature validation failed',
          };
        }

        const transfer = await resolveAchTransfer(client, provider, providerTransferId);

        if (!transfer) {
          await updateWebhookEvent(client, event.id, {
            processingStatus: WEBHOOK_PROCESSING_STATUS.IGNORED_UNRESOLVED_TRANSFER,
            errorMessage: `transfer not found for provider_transfer_id=${providerTransferId}`,
            processedAt: new Date(),
          });

          await client.query('COMMIT');

          return {
            ok: true,
            provider,
            provider_event_id: providerEventId,
            stored: true,
            processed: false,
            idempotent: false,
            status: 'ignored_unresolved_transfer',
          };
        }

        const mapping = mapProviderStatusToDomain(provider, providerStatus);

        if (!mapping.recognized) {
          await updateWebhookEvent(client, event.id, {
            processingStatus: WEBHOOK_PROCESSING_STATUS.IGNORED_UNKNOWN_STATUS,
            errorMessage: `unrecognized provider status: ${providerStatus}`,
            paymentIntentId: transfer.payment_intent_id,
            transferId: transfer.id,
            processedAt: new Date(),
          });

          await client.query('COMMIT');

          return {
            ok: true,
            provider,
            provider_event_id: providerEventId,
            stored: true,
            processed: false,
            idempotent: false,
            status: 'ignored_unknown_status',
          };
        }

        const nextState = mapping.domainStatus;
        const currentState = await getCurrentIntentState(client, transfer.payment_intent_id);

        if (TERMINAL_STATES.has(currentState) && currentState !== nextState) {
          await updateWebhookEvent(client, event.id, {
            processingStatus: WEBHOOK_PROCESSING_STATUS.IGNORED_TERMINAL_STATE,
            errorMessage: `intent already terminal in state=${currentState}`,
            paymentIntentId: transfer.payment_intent_id,
            transferId: transfer.id,
            processedAt: new Date(),
          });

          await client.query('COMMIT');

          return {
            ok: true,
            provider,
            provider_event_id: providerEventId,
            stored: true,
            processed: false,
            idempotent: false,
            status: 'ignored_terminal_state',
          };
        }

        if (!isAllowedTransition(currentState, nextState)) {
          await updateWebhookEvent(client, event.id, {
            processingStatus: WEBHOOK_PROCESSING_STATUS.ERROR,
            errorMessage: `invalid transition from ${currentState} to ${nextState}`,
            paymentIntentId: transfer.payment_intent_id,
            transferId: transfer.id,
            processedAt: new Date(),
          });

          await client.query('COMMIT');

          return {
            ok: true,
            provider,
            provider_event_id: providerEventId,
            stored: true,
            processed: false,
            idempotent: false,
            status: 'invalid_transition',
          };
        }

        let settlementApplied = false;

        if (nextState === DOMAIN_STATES.SETTLED) {
          const settlementResult = await applySettlementOnce(
            client,
            transfer.payment_intent_id,
            transfer.id
          );
          settlementApplied = settlementResult.applied;
        } else {
          const alreadyHasState = await intentStateExists(client, transfer.payment_intent_id, nextState);

          if (!alreadyHasState) {
              await insertIntentState(client, transfer.payment_intent_id, nextState, {
              reasonCode: 'provider_status_update',
              reasonDetail: `provider_status=${providerStatus}; provider_event_id=${providerEventId}; transfer_id=${transfer.id}`,
              correlationId: `ach_webhook_${providerEventId}`,
            });
          }
        }

        await updateWebhookEvent(client, event.id, {
          processingStatus: WEBHOOK_PROCESSING_STATUS.PROCESSED,
          paymentIntentId: transfer.payment_intent_id,
          transferId: transfer.id,
          settlementApplied,
          processedAt: new Date(),
        });

        await client.query('COMMIT');

        return {
          ok: true,
          provider,
          provider_event_id: providerEventId,
          stored: true,
          processed: true,
          idempotent: false,
        };
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {}

        throw error;
      }
    });
  } catch (error) {
    await markExistingWebhookAsError(provider, providerEventId, error.message);
    throw error;
  }
}

module.exports = {
  processAchWebhook,
};