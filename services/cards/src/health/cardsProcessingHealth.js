const { getCardsDbPool } = require('../infrastructure/cardsDb');
const outboxRepo = require('../outbox/cardsOutboxRepo');
const inboxRepo = require('../settlements/cardsWebhookInboxRepo');

async function getCardsProcessingHealth() {
  const pool = getCardsDbPool();
  const client = await pool.connect();

  try {
    const outbox = await outboxRepo.getOutboxHealthSnapshot(client);
    const inbox = await inboxRepo.getInboxHealthSnapshot(client);

    const { rows } = await client.query(`
      select
        count(*) filter (where status = 'pending_capture_anchor') as pending_orphans,
        coalesce(
          extract(epoch from now() - min(created_at)) filter (where status = 'pending_capture_anchor'),
          0
        ) as oldest_orphan_seconds
      from public.card_pending_reversals
    `);

    const reversals = rows[0];

    const status =
      Number(outbox.pending || 0) > 0 ||
      Number(inbox.deferred || 0) > 0 ||
      Number(reversals.pending_orphans || 0) > 0
        ? 'degraded'
        : 'ok';

    return {
      status,
      outbox: {
        pending: Number(outbox.pending || 0),
        retrying: Number(outbox.retrying || 0),
        stuck_claims: Number(outbox.stuck_claims || 0),
        oldest_pending_seconds: Number(outbox.oldest_pending_seconds || 0)
      },
      inbox: {
        pending: Number(inbox.pending || 0),
        deferred: Number(inbox.deferred || 0),
        failed_retryable: Number(inbox.failed_retryable || 0),
        oldest_pending_seconds: Number(inbox.oldest_pending_seconds || 0)
      },
      reversals: {
        pending_orphans: Number(reversals.pending_orphans || 0),
        oldest_orphan_seconds: Number(reversals.oldest_orphan_seconds || 0)
      }
    };
  } finally {
    client.release();
  }
}

module.exports = {
  getCardsProcessingHealth
};