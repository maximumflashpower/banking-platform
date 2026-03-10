'use strict';

const financialDb = require('../infrastructure/financialDb');
const { findByHoldRef, createHold: insertHold } = require('./repo');
const { publishFinancialEvent } = require('../outbox/publishFinancialEvent');

async function createHold(params) {
  const client = await financialDb.connect();

  try {
    await client.query('BEGIN');

    const existing = await findByHoldRef(params.holdRef, client);
    if (existing) {
      await client.query('COMMIT');
      return {
        hold: existing,
        idempotentReplay: true,
      };
    }

    const created = await insertHold(params, client);

    if (!created) {
      throw new Error('hold_insert_failed');
    }

    const eventPayload = {
      eventId: created.id,
      eventType: 'fin.ledger.hold_created.v1',
      occurredAt: new Date().toISOString(),
      data: {
        holdId: created.id,
        holdRef: created.hold_ref,
        spaceId: created.space_id,
        accountId: created.account_id,
        amount: Number(created.amount),
        currency: created.currency,
        status: created.status,
        reason: created.reason,
      },
    };

    await publishFinancialEvent('fin.ledger.hold_created.v1', eventPayload, client);

    await client.query('COMMIT');

    return {
      hold: created,
      idempotentReplay: false,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createHold,
};