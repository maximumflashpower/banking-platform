"use strict";

const { getBalances } = require("../core/balances");

function json(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function nowIso() {
  return new Date().toISOString();
}

async function handleGetBalances(req, res, url) {
  const spaceId = req.auth?.spaceId ? String(req.auth.spaceId) : "";
  if (!spaceId) return json(res, 401, { ok: false, error: "unauthorized", message: "session required" });

  // optional compatibility: ?space_id=... must match auth
  const qSpace = url.searchParams.get("space_id");
  if (qSpace && String(qSpace) !== spaceId) {
    return json(res, 403, { ok: false, error: "forbidden", message: "space_id mismatch" });
  }

  const currency = String(url.searchParams.get("currency") || "").trim().toUpperCase();
  if (!currency) return json(res, 400, { ok: false, error: "bad_request", message: "currency query param required" });

  const balances = await getBalances({ spaceId, currency });

  return json(res, 200, {
    ok: true,
    space_id: spaceId,
    currency,
    as_of: nowIso(),
    balances,
  });
}

module.exports = { handleGetBalances };