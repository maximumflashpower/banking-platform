'use strict';

const express = require('express');

// ---- Public routers ----
const approvalsRouter = require('./routes/approvals');
const paymentIntentsRouter = require('./routes/paymentIntents');
const financialInboxRouter = require('./routes/financialInbox');
const stepUpRouter = require('./routes/stepUp');

// ---- Internal routers ----
const businessesInternal = require('./routes/internal/businesses');
const casesInternal = require('./routes/internal/cases');
const caseAssignmentsInternal = require('./routes/internal/caseAssignments');
const caseStateInternal = require('./routes/internal/caseState');
const caseEvidenceInternal = require('./routes/internal/caseEvidence');
const stepUpStartInternal = require('./routes/internal/stepUpStart');
const paymentsAchSubmitInternal = require('./routes/internal/paymentsAchSubmit');
const paymentsAchWebhookInternal = require('./routes/internal/paymentsAchWebhook');

// Stage 4C
const reconciliationRunDaily = require('./routes/internal/reconciliationRunDaily');

const app = express();

// ---- Trust proxy (docker / k8s / nginx) ----
app.set('trust proxy', true);

// ---- Body parsing ----
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));

// =============================
// INTERNAL API
// =============================

app.use('/internal/v1/businesses', businessesInternal);
app.use('/internal/v1/security', stepUpStartInternal);

app.use('/internal/v1/cases', casesInternal);
app.use('/internal/v1/cases', caseAssignmentsInternal);
app.use('/internal/v1/cases', caseStateInternal);
app.use('/internal/v1/cases', caseEvidenceInternal);

app.use('/internal/v1/payments', paymentsAchSubmitInternal);
app.use('/internal/v1/payments', paymentsAchWebhookInternal);

// Stage 4C
app.use('/internal/v1', reconciliationRunDaily);


// =============================
// BASIC ROUTES
// =============================

// Root
app.get('/', (_req, res) => {
  res.status(200).send('OK - gateway-api up');
});

// Healthcheck
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'gateway-api',
    env: process.env.NODE_ENV || 'development',
  });
});


// =============================
// PUBLIC API
// =============================

app.use('/public/v1/finance', paymentIntentsRouter);
app.use('/public/v1/finance', approvalsRouter);

app.use('/public/v1/financial-inbox', financialInboxRouter);
app.use('/public/v1/auth', stepUpRouter);


// =============================
// NOT FOUND
// =============================

app.use((_req, res) => {
  res.status(404).json({
    error: 'not_found',
    path: _req.originalUrl,
  });
});


// =============================
// ERROR HANDLER
// =============================

app.use((err, _req, res, _next) => {
  console.error('[gateway-api] error:', err);

  if (res.headersSent) return;

  const status = Number(err?.status || err?.statusCode || 500);

  res.status(Number.isFinite(status) ? status : 500).json({
    error: 'internal_error',
    message: err?.message || 'unknown',
  });
});


// =============================
// SERVER START
// =============================

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`[gateway-api] listening on http://${HOST}:${PORT}`);
});


// =============================
// GRACEFUL SHUTDOWN
// =============================

function shutdown(signal) {

  console.log(`[gateway-api] received ${signal}, shutting down...`);

  server.close(() => {
    console.log('[gateway-api] server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[gateway-api] forced shutdown');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));