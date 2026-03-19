'use strict';

const crypto = require('crypto');
const financialDb = require('../../infrastructure/financialDb');
const ensureWalletLedgerAccount = require('./ensureWalletLedgerAccount');
const getWalletBalance = require('./getWalletBalance');

function buildLedgerEntryId() {
  return `le_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function transferBetweenWallets({
  fromWalletId,
  toWalletId,
  amount,
  currency,
  referenceType,
  referenceId
}) {
  const numericAmount = Number(amount);

  if (
    !fromWalletId ||
    !toWalletId ||
    !referenceType ||
    !referenceId ||
    !currency ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    return {
      ok: false,
      code: 'INVALID_TRANSFER_REQUEST',
      message: 'Invalid transfer payload'
    };
  }

  if (fromWalletId === toWalletId) {
    return {
      ok: false,
      code: 'INVALID_TRANSFER_REQUEST',
      message: 'from_wallet_id and to_wallet_id must be different'
    };
  }

  const fromAcc = await ensureWalletLedgerAccount({ walletId: fromWalletId });
  if (!fromAcc.ok) return fromAcc;

  const toAcc = await ensureWalletLedgerAccount({ walletId: toWalletId });
  if (!toAcc.ok) return toAcc;

  if (
    fromAcc.data.currency &&
    toAcc.data.currency &&
    fromAcc.data.currency !== toAcc.data.currency
  ) {
    return {
      ok: false,
      code: 'CURRENCY_MISMATCH',
      message: 'Wallet ledger accounts must share the same currency'
    };
  }

  const existing = await financialDb.query(
    `
    SELECT
      id,
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      reference_type,
      reference_id,
      created_at
    FROM ledger_entries
    WHERE reference_type = $1
      AND reference_id = $2
    LIMIT 1
    `,
    [referenceType, referenceId]
  );

  if (existing.rows && existing.rows.length > 0) {
    return {
      ok: true,
      data: {
        idempotent: true,
        ledger_entry_id: existing.rows[0].id,
        from_wallet_id: fromWalletId,
        to_wallet_id: toWalletId,
        amount: Number(existing.rows[0].amount),
        currency: existing.rows[0].currency
      }
    };
  }

  const balanceResult = await getWalletBalance({ walletId: fromWalletId });
  if (!balanceResult.ok) return balanceResult;

  if (Number(balanceResult.data.balance) < numericAmount) {
    return {
      ok: false,
      code: 'INSUFFICIENT_FUNDS',
      message: 'Not enough balance'
    };
  }

  const inserted = await financialDb.withTransaction(async (client) => {
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
      RETURNING
        id,
        debit_account_id,
        credit_account_id,
        amount,
        currency,
        reference_type,
        reference_id,
        created_at
      `,
      [
        buildLedgerEntryId(),
        fromAcc.data.ledger_account_id,
        toAcc.data.ledger_account_id,
        numericAmount,
        currency,
        referenceType,
        referenceId
      ]
    );

    return result.rows[0];
  });

  return {
    ok: true,
    data: {
      ledger_entry_id: inserted.id,
      from_wallet_id: fromWalletId,
      to_wallet_id: toWalletId,
      amount: Number(inserted.amount),
      currency: inserted.currency
    }
  };
}

module.exports = transferBetweenWallets;