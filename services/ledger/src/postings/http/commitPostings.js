"use strict";

const { commitPostings } = require("../core/commit");

function json(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

async function handleCommitPostings(req, res, url) {
  const idemKey = String(req.headers["idempotency-key"] || "").trim();
  if (!idemKey) return json(res, 400, { ok: false, error: "bad_request", message: "Idempotency-Key required" });

  const spaceId = req.auth?.spaceId ? String(req.auth.spaceId) : "";
  if (!spaceId) return json(res, 401, { ok: false, error: "unauthorized", message: "session required" });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { ok: false, error: "bad_request", message: "Invalid JSON" });
  }

  try {
    const out = await commitPostings({
      spaceId,
      idemKey,
      memo: body.memo || null,
      effectiveAt: body.effective_at || null,
      postings: body.postings || [],
    });
    // replay or new both return ok:true
    return json(res, 200, out);
  } catch (e) {
    const msg = String(e?.message || e);

    if (msg === "idempotency_conflict") return json(res, 409, { ok: false, error: "idempotency_conflict" });
    if (msg === "postings_min_2") return json(res, 400, { ok: false, error: "bad_request", message: "postings must be >= 2" });
    if (msg === "double_entry_violation")
      return json(res, 400, { ok: false, error: "bad_request", message: "sum(debits) must equal sum(credits)" });
    if (msg === "direction_invalid")
      return json(res, 400, { ok: false, error: "bad_request", message: "direction must be DEBIT|CREDIT" });
    if (msg === "amount_minor_invalid")
      return json(res, 400, { ok: false, error: "bad_request", message: "amount_minor must be positive integer" });
    if (msg === "currency_required") return json(res, 400, { ok: false, error: "bad_request", message: "currency required" });
    if (msg === "currency_mismatch")
      return json(res, 400, { ok: false, error: "bad_request", message: "all postings must share the same currency" });
    if (msg === "account_not_found_or_wrong_space")
      return json(res, 400, { ok: false, error: "bad_request", message: "account not found for space" });
    if (msg === "account_currency_mismatch")
      return json(res, 400, { ok: false, error: "bad_request", message: "posting currency must match account currency" });

    // fallback
    return json(res, 500, { ok: false, error: "internal_error" });
  }
}

module.exports = { handleCommitPostings };