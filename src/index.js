"use strict";

const http = require("http");
const crypto = require("crypto");

const { handleChat } = require("../services/social/src/chat-core/http/chatRoutes");
const { initDb } = require("../services/social/src/chat-core/infrastructure/postgres/initDb");

const { runMigrations: runIdentityMigrations } = require("../services/identity/src/infrastructure/postgres/migrate.js");
const IdentityAuth = require("./identity/auth");
const Kyc = require("./identity/kyc");

// Ledger (ETAPA 2B)
const { handleCommitPostings } = require("../services/ledger/src/postings/http/commitPostings");
const { handleGetBalances } = require("../services/ledger/src/accounts/http/getBalances");
const { ping: pingFinancial } = require("../services/ledger/src/infrastructure/financialDb");
const { handleEnsureWallet } = require("../services/ledger/src/accounts/http/ensureWallet");

const PORT = Number(process.env.PORT || 3000);
const SERVICE = process.env.SERVICE_NAME || "gateway-api";
const STARTED_AT = new Date();

function json(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function text(res, statusCode, body, headers = {}) {
  const payload = String(body);
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function nowIso() {
  return new Date().toISOString();
}

function getVersion() {
  return {
    service: SERVICE,
    node: process.version,
    commit: process.env.GIT_SHA || "unknown",
    startedAt: STARTED_AT.toISOString(),
    now: nowIso(),
    env: process.env.NODE_ENV || "development",
  };
}

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  const out = {};
  if (!header) return out;
  const parts = header.split(";");
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (opts.secure) parts.push("Secure");
  if (typeof opts.maxAge === "number") parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);

  const existing = res.getHeader("Set-Cookie");
  const next = [];
  if (Array.isArray(existing)) next.push(...existing);
  else if (typeof existing === "string") next.push(existing);
  next.push(parts.join("; "));
  res.setHeader("Set-Cookie", next);
}

function clearCookie(res, name) {
  setCookie(res, name, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
  });
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

async function attachAuth(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid ? String(cookies.sid).trim() : "";
  if (!sid) return null;

  const session = await IdentityAuth.validateSession(sid);
  if (!session) return null;

  req.auth = { userId: session.userId, spaceId: session.spaceId, sessionId: session.sessionId };
  return req.auth;
}

function requireAuth(res, req) {
  if (req.auth?.userId && req.auth?.spaceId && req.auth?.sessionId) return true;
  clearCookie(res, "sid");
  json(res, 401, { ok: false, error: "unauthorized", message: "session required" });
  return false;
}

async function route(req, res, requestId) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  res.setHeader("x-request-id", requestId);

  if (req.method === "GET" && path === "/health") return text(res, 200, "OK\n");
  if (req.method === "GET" && path === "/ready") return json(res, 200, { ok: true, service: SERVICE, time: nowIso() });
  if (req.method === "GET" && path === "/version") return json(res, 200, getVersion());
  if (req.method === "GET" && path === "/") {
    return json(res, 200, {
      ok: true,
      service: SERVICE,
      endpoints: [
        "/health",
        "/ready",
        "/version",
        "/public/v1/auth/register",
        "/public/v1/auth/login",
        "/public/v1/auth/logout",
        "/public/v1/identity/me",
        "/public/v1/identity/kyc/start",
        "/public/v1/identity/kyc/submit",
        "/public/v1/identity/kyc/status",
        "/public/v1/finance/balances?currency=USD (gated, ETAPA 2B)",
        "/internal/v1/ledger/postings/commit (Idempotency-Key, ETAPA 2B)",
        "/chat/*",
      ],
    });
  }

  // Attach auth (best effort for all requests)
  await attachAuth(req);

  // -------------------------
  // AUTH (public)
  // -------------------------
  if (req.method === "POST" && path === "/public/v1/auth/register") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { ok: false, error: "bad_request", message: "Invalid JSON" });
    }

    try {
      const result = await IdentityAuth.register({
        email: body.email,
        password: body.password,
        deviceId: "web",
      });

      setCookie(res, "sid", result.session.id, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
      });

      return json(res, 201, { ok: true, user: result.user, space: result.space });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === "email_in_use") return json(res, 409, { ok: false, error: "email_in_use" });
      if (msg === "password_too_short")
        return json(res, 400, { ok: false, error: "bad_request", message: "password must be >= 8 chars" });
      if (msg === "email_required") return json(res, 400, { ok: false, error: "bad_request", message: "email required" });
      return json(res, 400, { ok: false, error: "bad_request", message: msg });
    }
  }

  if (req.method === "POST" && path === "/public/v1/auth/login") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { ok: false, error: "bad_request", message: "Invalid JSON" });
    }

    try {
      const result = await IdentityAuth.login({
        email: body.email,
        password: body.password,
        deviceId: "web",
      });

      setCookie(res, "sid", result.session.id, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
      });

      return json(res, 200, { ok: true, user: result.user, space: result.space });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === "invalid_credentials") return json(res, 401, { ok: false, error: "invalid_credentials" });
      if (msg === "email_required") return json(res, 400, { ok: false, error: "bad_request", message: "email required" });
      if (msg === "password_required") return json(res, 400, { ok: false, error: "bad_request", message: "password required" });
      return json(res, 400, { ok: false, error: "bad_request", message: msg });
    }
  }

  if (req.method === "POST" && path === "/public/v1/auth/logout") {
    const sid = parseCookies(req).sid ? String(parseCookies(req).sid).trim() : "";
    if (sid) await IdentityAuth.logout(sid);
    clearCookie(res, "sid");
    return json(res, 200, { ok: true });
  }

  // -------------------------
  // IDENTITY (protected)
  // -------------------------
  if (req.method === "GET" && path === "/public/v1/identity/me") {
    if (!requireAuth(res, req)) return;
    const me = await IdentityAuth.getMe({ userId: req.auth.userId, spaceId: req.auth.spaceId });
    if (!me) return json(res, 404, { ok: false, error: "not_found" });
    return json(res, 200, { ok: true, ...me });
  }

  // KYC (ETAPA 2A)
  if (req.method === "POST" && path === "/public/v1/identity/kyc/start") {
    if (!requireAuth(res, req)) return;
    const out = await Kyc.startKyc(req.auth.userId);
    return json(res, 200, { ok: true, kyc: out });
  }

  if (req.method === "POST" && path === "/public/v1/identity/kyc/submit") {
    if (!requireAuth(res, req)) return;

    let body;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { ok: false, error: "bad_request", message: "Invalid JSON" });
    }

    try {
      const out = await Kyc.submitKyc(req.auth.userId, body);
      return json(res, 200, { ok: true, kyc: out });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === "kyc_not_pending") return json(res, 409, { ok: false, error: "kyc_not_pending" });
      if (msg === "invalid_decision")
        return json(res, 400, { ok: false, error: "bad_request", message: "decision must be verify|reject" });
      throw e;
    }
  }

  if (req.method === "GET" && path === "/public/v1/identity/kyc/status") {
    if (!requireAuth(res, req)) return;
    const out = await Kyc.getStatus(req.auth.userId);
    return json(res, 200, { ok: true, kyc: out });
  }

  // -------------------------
  // LEDGER (internal) — ETAPA 2B
  // -------------------------
  if (req.method === "POST" && path === "/internal/v1/ledger/postings/commit") {
    if (!requireAuth(res, req)) return;
    return handleCommitPostings(req, res, url);
  }

  if (req.method === "POST" && path === "/internal/v1/ledger/wallet/ensure") {
    if (!requireAuth(res, req)) return;
    return handleEnsureWallet(req, res, url);
  }

  // -------------------------
  // FINANCE (gated) — ETAPA 2B
  // -------------------------
  if (path.startsWith("/public/v1/finance")) {
    if (!requireAuth(res, req)) return;

    const ok = await Kyc.requireKycVerified(req.auth.userId);
    if (!ok) {
      return json(res, 403, { ok: false, error: "kyc_required", message: "KYC verified required for finance" });
    }

    // ETAPA 2B: balances
    if (req.method === "GET" && path === "/public/v1/finance/balances") {
      return handleGetBalances(req, res, url);
    }

    // Otros endpoints finance aún no implementados
    return json(res, 501, { ok: false, error: "not_implemented", stage: "2B" });
  }

  // -------------------------
  // SOCIAL (protected)
  // -------------------------
  if (path.startsWith("/chat")) {
    if (!requireAuth(res, req)) return;
    const handled = await handleChat(req, res, url);
    if (handled !== null) return handled;
  }

  return json(res, 404, { ok: false, error: "not_found", path, requestId });
}

const server = http.createServer(async (req, res) => {
  const requestId = req.headers["x-request-id"]?.toString() || crypto.randomUUID();
  const t0 = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - t0;
    console.log(JSON.stringify({ time: nowIso(), requestId, method: req.method, url: req.url, statusCode: res.statusCode, ms }));
  });

  try {
    await route(req, res, requestId);
  } catch (err) {
    console.error(JSON.stringify({ time: nowIso(), requestId, error: String(err?.stack || err) }));
    json(res, 500, { ok: false, error: "internal_error", requestId });
  }
});

function shutdown(signal) {
  console.log(JSON.stringify({ time: nowIso(), signal, msg: "shutting_down" }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function bootstrap() {
  // 1) Social DB migrations (chat)
  await initDb();
  console.log(JSON.stringify({ msg: "social_db_ready" }));

  // 2) Identity DB migrations
  const applied = await runIdentityMigrations();
  console.log(JSON.stringify({ msg: "identity_db_ready", applied }));

  // 3) Financial DB ready check (ledger core)
  const finOk = await pingFinancial();
  console.log(JSON.stringify({ msg: "financial_db_ready", ok: finOk }));

  server.listen(PORT, "0.0.0.0", () => {
    console.log(JSON.stringify({ time: nowIso(), msg: "listening", port: PORT, service: SERVICE, node: process.version }));
  });
}

bootstrap().catch((err) => {
  console.error(JSON.stringify({ time: nowIso(), msg: "bootstrap_failed", error: String(err?.stack || err) }));
  process.exit(1);
});