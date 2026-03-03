"use strict";

const crypto = require("crypto");
const { withTx } = require("../../infrastructure/financialDb");
const { toUuid } = require("../../shared/toUuid");

const IDEM_SCOPE = "POST /internal/v1/ledger/postings/commit";

// Canonical JSON stringify (stable order) for request hashing
function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",")}}`;
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Convert first 8 bytes of sha256 into signed bigint string for advisory lock
function advisoryLockKey64(spaceId, scope, idemKey) {
  const h = crypto.createHash("sha256").update(`${spaceId}|${scope}|${idemKey}`).digest();
  let x = 0n;
  for (let i = 0; i < 8; i++) x = (x << 8n) + BigInt(h[i]);
  const maxSigned = (1n << 63n) - 1n;
  const signed = x <= maxSigned ? x : x - (1n << 64n);
  return signed.toString();
}

function sumByDirection(postings, dir) {
  let total = 0n;
  for (const p of postings) {
    if (p.direction === dir) total += BigInt(p.amount_minor);
  }
  return total;
}

function normalizePosting(p) {
  return {
    account_id: String(p.account_id || "").trim(),
    direction: String(p.direction || "").trim().toUpperCase(),
    amount_minor: Number(p.amount_minor),
    currency: String(p.currency || "").trim().toUpperCase(),
  };
}

function validateCommitInput({ spaceId, idemKey, postings, currency }) {
  if (!spaceId) throw new Error("space_id_required");
  if (!idemKey) throw new Error("idempotency_key_required");
  if (!Array.isArray(postings) || postings.length < 2) throw new Error("postings_min_2");

  const allowedDir = new Set(["DEBIT", "CREDIT"]);

  for (const p of postings) {
    if (!p.account_id) throw new Error("account_id_required");
    if (!allowedDir.has(p.direction)) throw new Error("direction_invalid");
    if (!Number.isInteger(p.amount_minor) || p.amount_minor <= 0) throw new Error("amount_minor_invalid");
    if (!p.currency) throw new Error("currency_required");
    if (currency && p.currency !== currency) throw new Error("currency_mismatch");
  }

  const debits = sumByDirection(postings, "DEBIT");
  const credits = sumByDirection(postings, "CREDIT");
  if (debits !== credits) throw new Error("double_entry_violation");
}

async function commitPostings({ spaceId, idemKey, memo, effectiveAt, postings }) {
  const spaceUuid = toUuid(spaceId);

  const norm = (postings || []).map(normalizePosting);
  const currency = norm[0]?.currency || null;

  validateCommitInput({ spaceId: spaceUuid, idemKey, postings: norm, currency });

  // Hash request (include everything that makes it “the same”)
  const requestBodyForHash = {
    space_id: spaceUuid,
    memo: memo || null,
    effective_at: effectiveAt || null,
    postings: norm,
  };
  const requestHash = sha256Hex(stableStringify(requestBodyForHash));

  const lockKey = advisoryLockKey64(spaceUuid, IDEM_SCOPE, idemKey);

  return withTx(async (db) => {
    // Serialize same (space,scope,key) without updates (append-only idempotency)
    await db.query("SELECT pg_advisory_xact_lock($1::bigint) AS locked", [lockKey]);

    // Replay?
    const existing = await db.query(
      "SELECT request_hash, response_json FROM idempotency_keys WHERE space_id=$1::uuid AND scope=$2 AND idem_key=$3 LIMIT 1",
      [spaceUuid, IDEM_SCOPE, idemKey]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) throw new Error("idempotency_conflict");
      return row.response_json; // already committed
    }

    // Validate accounts belong to space & currency matches
    const accountIds = [...new Set(norm.map((p) => p.account_id))];
    const acc = await db.query(
      "SELECT id, currency FROM ledger_accounts WHERE space_id=$1::uuid AND id = ANY($2::uuid[])",
      [spaceUuid, accountIds]
    );
    if (acc.rows.length !== accountIds.length) throw new Error("account_not_found_or_wrong_space");

    const currencyById = new Map(acc.rows.map((r) => [String(r.id), String(r.currency).toUpperCase()]));
    for (const p of norm) {
      const accCur = currencyById.get(p.account_id);
      if (!accCur) throw new Error("account_not_found_or_wrong_space");
      if (accCur !== p.currency) throw new Error("account_currency_mismatch");
    }

    // Insert journal entry (append-only)
    const je = await db.query(
      "INSERT INTO ledger_journal_entries (space_id, memo, effective_at) VALUES ($1::uuid,$2,COALESCE($3::timestamptz, now())) RETURNING id, space_id, created_at, effective_at",
      [spaceUuid, memo || null, effectiveAt || null]
    );
    const journalEntryId = je.rows[0].id;

    // Bulk insert postings (append-only)
    const values = [];
    const params = [];
    let i = 1;
    for (const p of norm) {
      values.push(`($${i++}::uuid,$${i++}::uuid,$${i++}::uuid,$${i++}::text,$${i++}::bigint,$${i++}::char(3))`);
      params.push(spaceUuid, journalEntryId, p.account_id, p.direction, p.amount_minor, p.currency);
    }

    await db.query(
      `INSERT INTO ledger_postings (space_id, journal_entry_id, account_id, direction, amount_minor, currency)
       VALUES ${values.join(",")}`,
      params
    );

    // Outbox (append-only, obligatorio)
    const eventType = "fin.ledger.journal_posted.v1";
    const payload = {
      space_id: spaceUuid,
      journal_entry_id: journalEntryId,
      memo: memo || null,
      effective_at: je.rows[0].effective_at,
      postings: norm,
    };

    await db.query(
      "INSERT INTO financial_outbox (space_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1::uuid,$2,$3,$4,$5::jsonb)",
      [spaceUuid, eventType, "ledger_journal_entry", journalEntryId, JSON.stringify(payload)]
    );

    const response = {
      ok: true,
      journal_entry_id: journalEntryId,
      space_id: spaceUuid,
      created_at: je.rows[0].created_at,
      effective_at: je.rows[0].effective_at,
    };

    // Idempotency record (append-only)
    await db.query(
      "INSERT INTO idempotency_keys (space_id, scope, idem_key, request_hash, response_json) VALUES ($1::uuid,$2,$3,$4,$5::jsonb)",
      [spaceUuid, IDEM_SCOPE, idemKey, requestHash, JSON.stringify(response)]
    );

    return response;
  });
}

module.exports = { commitPostings };