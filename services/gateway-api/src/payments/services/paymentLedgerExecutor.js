'use strict';

const crypto = require('crypto');
const financialDb = require('../../infrastructure/financialDb');

function buildLedgerEntryId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `le_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function insertLedgerEntry(client, paymentIntent) {
  const ledgerTransactionId = buildLedgerEntryId();

  const debitAccountId = process.env.PAYMENT_LEDGER_SOURCE_ACCOUNT_ID;
  const creditAccountId = process.env.PAYMENT_LEDGER_DESTINATION_ACCOUNT_ID;

  if (!debitAccountId) {
    const error = new Error('PAYMENT_LEDGER_SOURCE_ACCOUNT_ID is required');
    error.code = 'LEDGER_SOURCE_ACCOUNT_REQUIRED';
    throw error;
  }

  if (!creditAccountId) {
    const error = new Error('PAYMENT_LEDGER_DESTINATION_ACCOUNT_ID is required');
    error.code = 'LEDGER_DESTINATION_ACCOUNT_REQUIRED';
    throw error;
  }

  const result = await client.query(
    `
      INSERT INTO ledger_entries (
        id,
        debit_account_id,
        credit_account_id,
        amount,
        currency,
        reference_type,
        reference_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      ledgerTransactionId,
      debitAccountId,
      creditAccountId,
      paymentIntent.amount,
      paymentIntent.currency,
      'payment_intent_execution',
      paymentIntent.id,
    ]
  );

  return {
    ledgerTransactionId: result.rows[0].id,
  };
}

async function executePaymentIntentLedger({ client, paymentIntent }) {
  if (!client) {
    const dbClient = await financialDb.connect();

    try {
      await dbClient.query('BEGIN');
      const result = await insertLedgerEntry(dbClient, paymentIntent);
      await dbClient.query('COMMIT');
      return result;
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  }

  return insertLedgerEntry(client, paymentIntent);
}

module.exports = {
  executePaymentIntentLedger,
};