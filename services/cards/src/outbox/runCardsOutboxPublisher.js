const { getCardsDbPool, withCardsDbTransaction } = require('../infrastructure/cardsDb');
const metrics = require('../infrastructure/metrics');
const logger = require('../shared/logger');
const repo = require('./cardsOutboxRepo');
const { publishCardsOutboxBatch } = require('./publishCardsOutboxBatch');

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCardsOutboxPublisher() {
  const workerId = process.env.CARDS_OUTBOX_WORKER_ID || `cards-outbox-${process.pid}`;
  const pollMs = Number(process.env.CARDS_OUTBOX_POLL_MS || 2000);
  const batchSize = Number(process.env.CARDS_OUTBOX_BATCH_SIZE || 50);
  const staleClaimSeconds = Number(process.env.CARDS_OUTBOX_STALE_CLAIM_SECONDS || 120);

  logger.info('starting cards outbox publisher', { workerId, pollMs, batchSize });

  while (true) {
    try {
      const released = await withCardsDbTransaction((client) =>
        repo.releaseStaleClaims(client, { olderThanSeconds: staleClaimSeconds })
      );

      if (released > 0) {
        logger.warn('released stale cards outbox claims', { workerId, released });
      }

      const result = await publishCardsOutboxBatch({ workerId, batchSize });

      const pool = getCardsDbPool();
      const client = await pool.connect();

      try {
        const health = await repo.getOutboxHealthSnapshot(client);
        metrics.setGauge('cards_outbox_pending', Number(health.pending || 0));
        metrics.setGauge('cards_outbox_oldest_pending_seconds', Number(health.oldest_pending_seconds || 0));
        metrics.setGauge('cards_processing_stuck_claims', Number(health.stuck_claims || 0));
      } finally {
        client.release();
      }

      if (result.claimed === 0) {
        await sleep(pollMs);
      }
    } catch (error) {
      logger.error('cards outbox publisher loop failed', {
        workerId,
        error: error.message
      });
      await sleep(pollMs);
    }
  }
}

if (require.main === module) {
  runCardsOutboxPublisher().catch((error) => {
    logger.error('cards outbox publisher crashed', { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  runCardsOutboxPublisher
};