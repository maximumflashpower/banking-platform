const { withCardsDbTransaction } = require('../infrastructure/cardsDb');
const metrics = require('../infrastructure/metrics');
const logger = require('../shared/logger');
const { nextRetryDate } = require('../shared/backoff');
const repo = require('./cardsOutboxRepo');
const publisher = require('./cardsEventBusPublisher');

async function publishCardsOutboxBatch({ workerId, batchSize = 50 }) {
  const claimed = await withCardsDbTransaction((client) =>
    repo.claimPublishableBatch(client, { workerId, limit: batchSize })
  );

  if (!claimed.length) {
    return { claimed: 0, published: 0, failed: 0 };
  }

  let published = 0;
  let failed = 0;

  for (const event of claimed) {
    const startedAt = Date.now();
    metrics.incCounter('cards_outbox_publish_attempt_total', 1);

    try {
      const envelope = {
        event_id: event.id,
        event_type: event.event_type,
        event_version: 1,
        occurred_at: event.created_at,
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        correlation_id: event.correlation_id || null,
        idempotency_key: event.idempotency_key || null,
        payload: event.payload
      };

      await publisher.publish({
        topic: publisher.resolveTopic(event.event_type),
        key: event.aggregate_id,
        headers: {
          event_id: event.id,
          event_type: event.event_type,
          correlation_id: event.correlation_id || '',
          idempotency_key: event.idempotency_key || ''
        },
        payload: envelope
      });

      await withCardsDbTransaction((client) => repo.markPublished(client, { id: event.id }));

      published += 1;
      metrics.incCounter('cards_outbox_publish_success_total', 1);
      metrics.observeHistogram('cards_outbox_publish_latency_ms', Date.now() - startedAt);
    } catch (error) {
      failed += 1;
      const attempts = Number(event.attempts || 0) + 1;

      await withCardsDbTransaction((client) =>
        repo.markPublishFailed(client, {
          id: event.id,
          errorMessage: error.message,
          nextRetryAt: nextRetryDate(attempts)
        })
      );

      metrics.incCounter('cards_outbox_publish_failure_total', 1);

      logger.error('cards outbox publish failed', {
        workerId,
        eventId: event.id,
        eventType: event.event_type,
        attempts,
        error: error.message
      });
    }
  }

  return { claimed: claimed.length, published, failed };
}

module.exports = {
  publishCardsOutboxBatch
};