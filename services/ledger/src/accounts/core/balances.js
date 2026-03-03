"use strict";

const { pool } = require("../../infrastructure/financialDb");
const { toUuid } = require("../../shared/toUuid");

async function getBalances({ spaceId, currency }) {
  // Asegurarse de que `spaceId` esté convertido a UUID
  const spaceUuid = toUuid(spaceId); 
  const normalizedCurrency = String(currency || "").trim().toUpperCase();

  // Validación de los parámetros
  if (!spaceUuid || !normalizedCurrency) {
    throw new Error("Invalid spaceId or currency");
  }

  // Consulta SQL para obtener los balances
  const r = await pool.query(
    `
    SELECT
      a.id AS account_id,
      a.code,
      a.name,
      COALESCE(SUM(CASE WHEN p.direction = 'DEBIT' THEN p.amount_minor ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN p.direction = 'CREDIT' THEN p.amount_minor ELSE 0 END), 0)
      AS balance_minor
    FROM ledger_accounts a
    LEFT JOIN ledger_postings p
      ON p.account_id = a.id
     AND p.space_id = a.space_id
     AND p.currency = $2
    WHERE a.space_id = $1
      AND a.currency = $2
    GROUP BY a.id, a.code, a.name
    ORDER BY a.code ASC
    `,
    [spaceUuid, normalizedCurrency] // Usamos el UUID y la moneda normalizada
  );

  // Mapear y retornar los resultados de la consulta
  return r.rows.map((x) => ({
    account_id: x.account_id,
    code: x.code,
    name: x.name,
    balance_minor: Number(x.balance_minor), // Convertir balance_minor a un número
  }));
}

module.exports = { getBalances };