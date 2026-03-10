'use strict';

const financialDb = require('../infrastructure/financialDb');
const { findByHoldRef, releaseHoldByRef } = require('./repo');
const { publishFinancialEvent } = require('../outbox/publishFinancialEvent');

async function releaseHold({ holdRef, reason = 'manual_release' }) {
  const client = await financialDb.connect();

  try {
    await client.query('BEGIN');

    const existing = await findByHoldRef(holdRef, client);
    if (!existing) {
      throw new Error(`hold_not_found:${holdRef}`);
    }

    if (existing.status === 'released') {
      await client.query('COMMIT');
      return {
        hold: existing,
        idempotentReplay: true,
      };
    }

    let released = await releaseHoldByRef(holdRef, reason, client);

    if (!released) {
      released = await findByHoldRef(holdRef, client);
    }

    const eventPayload = {
      eventId: released.id,
      eventType: 'fin.ledger.hold_released.v1',
      occurredAt: new Date().toISOString(),
      data: {
        holdId: released.id,
        holdRef: released.hold_ref,
        spaceId: released.space_id,
        accountId: released.account_id,
        amount: Number(released.amount),
        currency: released.currency,
        status: released.status,
        reason,
      },
    };

    await publishFinancialEvent('fin.ledger.hold_released.v1', eventPayload, client);

    await client.query('COMMIT');

    return {
      hold: released,
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
  releaseHold,
};