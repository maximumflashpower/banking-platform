"use strict";

const { pool } = require("../../infrastructure/financialDb");
const { toUuid } = require("../../shared/toUuid");

async function ensurePersonalWallet({ spaceId, currency = "USD" }) {
  const spaceUuid = toUuid(spaceId);
  const cur = String(currency || "").trim().toUpperCase();
  if (!cur) throw new Error("currency_required");

  await pool.query(
    `
    INSERT INTO ledger_accounts (space_id, code, name, type, currency, normal_side)
    VALUES
      ($1::uuid, 'CASH',   'Wallet Cash',  'ASSET',  $2::char(3), 'DEBIT'),
      ($1::uuid, 'EQUITY', 'Owner Equity', 'EQUITY', $2::char(3), 'CREDIT')
    ON CONFLICT (space_id, code) DO NOTHING
    `,
    [spaceUuid, cur]
  );

  const r = await pool.query(
    `SELECT id, code, name, type, currency, normal_side
     FROM ledger_accounts
     WHERE space_id=$1::uuid AND currency=$2::char(3)
     ORDER BY code`,
    [spaceUuid, cur]
  );

  return r.rows.map((x) => ({
    id: x.id,
    code: x.code,
    name: x.name,
    type: x.type,
    currency: String(x.currency).toUpperCase(),
    normal_side: x.normal_side,
  }));
}

module.exports = { ensurePersonalWallet };