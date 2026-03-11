'use strict';

const { withCardsDbTransaction } = require('../infrastructure/cardsDb');
const logger = require('../shared/logger');
const inboxRepo = require('./cardsWebhookInboxRepo');
const { processCaptureReceived } = require('./processCaptureReceived');
const { processReversalReceived } = require('./processReversalReceived');

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOneEvent(client, event) {
  if (event.event_type === 'card.capture.received') {
    return processCaptureReceived(client, event);
  }

  if (event.event_type === 'card.reversal.received') {
    return processReversalReceived(client, event);
  }

  return {
    status: 'failed_terminal',
    reason: `unsupported_event_type:${event.event_type}`
  };
}

function nextAttemptCount(event) {
  return Number(event.process_attempts || 0) + 1;
}

async function runCardsWebhookProcessor() {
  const workerId =
    process.env.CARDS_WEBHOOK_WORKER_ID || `cards-webhook-${process.pid}`;
  const pollMs = Number(process.env.CARDS_WEBHOOK_POLL_MS || 2000);
  const batchSize = Number(process.env.CARDS_WEBHOOK_BATCH_SIZE || 25);
  const maxAttempts = Number(process.env.CARDS_WEBHOOK_MAX_ATTEMPTS || 20);

  logger.info('starting cards webhook processor', {
    workerId,
    pollMs,
    batchSize,
    maxAttempts
  });

  while (true) {
    try {
      const events = await withCardsDbTransaction((client) =>
        inboxRepo.claimPendingBatch(client, {
          workerId,
          limit: batchSize
        })
      );

      if (!events.length) {
        await sleep(pollMs);
        continue;
      }

      for (const event of events) {
        try {
          await withCardsDbTransaction(async (client) => {
            const result = await processOneEvent(client, event);

            if (result.status === 'processed') {
              await inboxRepo.markProcessed(client, { id: event.id });
              return;
            }

            if (result.status === 'duplicate') {
              await inboxRepo.markDuplicate(client, {
                id: event.id,
                duplicateOf: result.duplicateOf || null
              });
              return;
            }

            if (result.status === 'deferred') {
              await inboxRepo.markDeferred(client, {
                id: event.id,
                reason: 'waiting_capture_anchor'
              });
              return;
            }

            if (result.status === 'failed_terminal') {
              await inboxRepo.markTerminalFailure(client, {
                id: event.id,
                reason: result.reason || 'terminal_error'
              });
              return;
            }

            if (nextAttemptCount(event) >= maxAttempts) {
              await inboxRepo.markTerminalFailure(client, {
                id: event.id,
                reason: `max_attempts_exceeded:${result.reason || 'retryable_error'}`
              });
              return;
            }

            await inboxRepo.markRetryableFailure(client, {
              id: event.id,
              reason: result.reason || 'retryable_error'
            });
          });
        } catch (error) {
          logger.error('cards webhook event processing failed', {
            workerId,
            eventId: event.id,
            eventType: event.event_type,
            error: error.message
          });

          if (nextAttemptCount(event) >= maxAttempts) {
            await withCardsDbTransaction((client) =>
              inboxRepo.markTerminalFailure(client, {
                id: event.id,
                reason: `max_attempts_exceeded:${error.message}`
              })
            );
            continue;
          }

          await withCardsDbTransaction((client) =>
            inboxRepo.markRetryableFailure(client, {
              id: event.id,
              reason: error.message
            })
          );
        }
      }
    } catch (error) {
      logger.error('cards webhook processor loop failed', {
        workerId,
        error: error.message
      });
      await sleep(pollMs);
    }
  }
}

if (require.main === module) {
  runCardsWebhookProcessor().catch((error) => {
    logger.error('cards webhook processor crashed', {
      error: error.message
    });
    process.exit(1);
  });
}

module.exports = {
  runCardsWebhookProcessor
};