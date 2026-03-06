'use strict';

const express = require('express');

const approvalsRouter = require('./routes/approvals');
const paymentIntentsRouter = require('./routes/paymentIntents');
const financialInboxRouter = require('./routes/financialInbox');
const businessesInternal = require('./routes/internal/businesses');
const casesInternal = require('./routes/internal/cases');
const caseAssignmentsInternal = require('./routes/internal/caseAssignments');
const caseStateInternal = require('./routes/internal/caseState');
const stepUpRouter = require('./routes/stepUp');

const app = express();

// Trust proxy (útil en docker/k8s / reverse proxies)
app.set('trust proxy', true);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// ---- Internal routes ----
app.use('/internal/v1/businesses', businessesInternal);
app.use('/internal/v1/cases', casesInternal);
app.use('/internal/v1/cases', caseAssignmentsInternal);
app.use('/internal/v1/cases', caseStateInternal);

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

// ---- Public API routes ----
app.use('/public/v1/finance', paymentIntentsRouter);
app.use('/public/v1/finance', approvalsRouter);

// Si tu gateway ya tiene inbox, lo dejamos
app.use('/public/v1/financial-inbox', financialInboxRouter);
app.use('/public/v1/auth', stepUpRouter);

// ---- Not Found ----
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// ---- Error handler ----
/* eslint-disable no-unused-vars */
app.use((err, _req, res, _next) => {
  console.error('[gateway-api] error:', err);

  if (res.headersSent) return;

  const status = Number(err?.status || err?.statusCode || 500);
  res.status(Number.isFinite(status) ? status : 500).json({
    error: 'internal_error',
    message: err?.message || 'unknown',
  });
});
/* eslint-enable no-unused-vars */

const PORT = Number(process.env.PORT || 3000);
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

  setTimeout(() => {
    console.error('[gateway-api] forced shutdown');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));