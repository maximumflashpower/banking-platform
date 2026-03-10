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

// Stage 4C / 4E
const reconciliationRunDaily = require('./routes/internal/reconciliationRunDaily');
const reconciliationRunsInternal = require('./routes/internal/reconciliationRuns');
const reconciliationActionsInternal = require('./routes/internal/reconciliationActions');

// Stage 5A / 5B / 5C
const internalCardsRouter = require('./routes/internal/cards');
const cardsAuthDecisionRouter = require('./routes/internal/cardsAuthDecision');
const cardsAuthorizationWebhookRouter = require('./routes/internal/cardsAuthorizationWebhook');

// Ledger domain HTTP adapters
const ledgerCreateHoldRouter = require('./routes/internal/ledgerHoldsCreate');
const ledgerReleaseHoldRouter = require('./routes/internal/ledgerHoldsRelease');
const ledgerBalancesRouter = require('./routes/internal/ledgerAccountsBalance');
const ledgerEnsureWalletRouter = require('./routes/internal/ledgerEnsureWallet');

const app = express();

app.set('trust proxy', true);

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

// Stage 4E
app.use('/internal/v1/reconciliation/runs', reconciliationRunsInternal);
app.use('/internal/v1/reconciliation/actions', reconciliationActionsInternal);

// Stage 5A
app.use('/internal/v1/cards', internalCardsRouter);

// Stage 5B
app.use('/internal/v1/cards', cardsAuthDecisionRouter);
app.use('/internal/v1/cards', cardsAuthorizationWebhookRouter);

// Stage 5C - Ledger internal routes mounted in gateway-api
app.use('/internal/v1/ledger', ledgerCreateHoldRouter);
app.use('/internal/v1/ledger', ledgerReleaseHoldRouter);
app.use('/internal/v1/ledger', ledgerBalancesRouter);
app.use('/internal/v1/ledger', ledgerEnsureWalletRouter);

// =============================
// BASIC ROUTES
// =============================

app.get('/', (_req, res) => {
  res.status(200).send('OK - gateway-api up');
});

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

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    path: req.originalUrl,
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