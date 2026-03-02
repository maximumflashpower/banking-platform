"use strict";

const http = require("http");
const crypto = require("crypto");

const { handleChat } = require("../services/social/src/chat-core/http/chatRoutes");
const { initDb } = require("../services/social/src/chat-core/infrastructure/postgres/initDb");

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

async function route(req, res, requestId) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  // Standard headers
  res.setHeader("x-request-id", requestId);

  if (req.method === "GET" && path === "/health") {
    return text(res, 200, "OK\n");
  }

  if (req.method === "GET" && path === "/ready") {
    // En el futuro: checks reales (db/redis/broker). Por ahora listo si el proceso vive.
    return json(res, 200, { ok: true, service: SERVICE, time: nowIso() });
  }

  if (req.method === "GET" && path === "/version") {
    return json(res, 200, getVersion());
  }

  if (req.method === "GET" && path === "/") {
    return json(res, 200, { ok: true, service: SERVICE, endpoints: ["/health", "/ready", "/version"] });
  }

    // Chat Core routes
  if (path.startsWith("/chat")) {
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
    // logging simple (stdout) — compatible con docker logs
    console.log(
      JSON.stringify({
        time: nowIso(),
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        ms,
      })
    );
  });

  try {
    await route(req, res, requestId);
  } catch (err) {
    console.error(JSON.stringify({ time: nowIso(), requestId, error: String(err?.stack || err) }));
    json(res, 500, { ok: false, error: "internal_error", requestId });
  }
});

// Graceful shutdown
function shutdown(signal) {
  console.log(JSON.stringify({ time: nowIso(), signal, msg: "shutting_down" }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ time: nowIso(), msg: "listening", port: PORT, service: SERVICE, node: process.version }));
});
