"use strict";

const { ensurePersonalWallet } = require("../core/ensureWallet");

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

async function handleEnsureWallet(req, res) {
  const spaceId = req.auth?.spaceId ? String(req.auth.spaceId) : "";
  if (!spaceId) return json(res, 401, { ok: false, error: "unauthorized", message: "session required" });

  let body = {};
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { ok: false, error: "bad_request", message: "Invalid JSON" });
  }

  const currency = body.currency ? String(body.currency).trim().toUpperCase() : "USD";

  try {
    const accounts = await ensurePersonalWallet({ spaceId, currency });
    return json(res, 200, { ok: true, space_id: spaceId, currency, wallet: { accounts } });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === "currency_required") return json(res, 400, { ok: false, error: "bad_request", message: "currency required" });
    return json(res, 500, { ok: false, error: "internal_error" });
  }
}

module.exports = { handleEnsureWallet };