'use strict';

const express = require('express');

const paymentIntentsRouter = require('./routes/paymentIntents');

const app = express();

// Trust proxy (útil en docker/k8s / reverse proxies)
app.set('trust proxy', true);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// ---- Basic routes ----

// Root (para evitar "Cannot GET /")
app.get('/', (_req, res) => {
  res.status(200).send('OK - gateway-api up');
});

// Healthcheck (útil para compose/k8s)
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'gateway-api',
    env: process.env.NODE_ENV || 'development',
  });
});

// ---- API routes ----
// Public Finance routes
app.use('/public/v1/finance', paymentIntentsRouter);

// ---- Not Found ----
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// ---- Error handler ----
/* eslint-disable no-unused-vars */
app.use((err, _req, res, _next) => {
  console.error('[gateway-api] error:', err);

  // Si Express ya empezó a enviar headers, delega a default handler
  if (res.headersSent) return;

  const status = Number(err?.status || err?.statusCode || 500);
  res.status(Number.isFinite(status) ? status : 500).json({
    error: 'internal_error',
    message: err?.message || 'unknown',
  });
});
/* eslint-enable no-unused-vars */

const PORT = Number(process.env.PORT || 3010);
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`[gateway-api] listening on http://${HOST}:${PORT}`);
});

// ---- Graceful shutdown (Docker-friendly) ----
function shutdown(signal) {
  console.log(`[gateway-api] received ${signal}, shutting down...`);
  server.close(() => {
    console.log('[gateway-api] server closed');
    process.exit(0);
  });

  // fuerza salida si algo queda colgado
  setTimeout(() => {
    console.error('[gateway-api] forced shutdown');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));