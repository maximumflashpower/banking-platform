'use strict';

const http = require('http');
const express = require('express');

const identityRoutes = require('./routes/identity');
const paymentIntentsRoutes = require('./routes/paymentIntents');
const approvalsRoutes = require('./routes/approvals');
const financialInboxRoutes = require('./routes/financialInbox');
const cardsDisputesRoutes = require('./routes/cardsDisputes');
const stepUpRoutes = require('./routes/stepUp');

<<<<<<< HEAD
const internalBusinessesRoutes = require('./routes/internal/businesses');
const internalCasesRoutes = require('./routes/internal/cases');
const internalCaseAssignmentsRoutes = require('./routes/internal/caseAssignments');
const internalCaseEvidenceRoutes = require('./routes/internal/caseEvidence');
const internalCaseStateRoutes = require('./routes/internal/caseState');
const internalCardsRoutes = require('./routes/internal/cards');
const internalCardsAuthDecisionRoutes = require('./routes/internal/cardsAuthDecision');
const internalCardsAuthorizationWebhookRoutes = require('./routes/internal/cardsAuthorizationWebhook');
const internalCardsFinancialWebhookRoutes = require('./routes/internal/cardsFinancialWebhook');
const internalLedgerEnsureWalletRoutes = require('./routes/internal/ledgerEnsureWallet');
const internalLedgerAccountsBalanceRoutes = require('./routes/internal/ledgerAccountsBalance');
const internalLedgerHoldsCreateRoutes = require('./routes/internal/ledgerHoldsCreate');
const internalLedgerHoldsReleaseRoutes = require('./routes/internal/ledgerHoldsRelease');
const internalLedgerPostingsCommitRoutes = require('./routes/internal/ledgerPostingsCommit');
const internalPaymentsAchSubmitRoutes = require('./routes/internal/paymentsAchSubmit');
const internalPaymentsAchWebhookRoutes = require('./routes/internal/paymentsAchWebhook');
const internalPaymentIntentRiskGateRoutes = require('./routes/internal/paymentIntentRiskGate');
const internalRiskSignalsIngestRoutes = require('./routes/internal/riskSignalsIngest');
const internalRiskDecisionEvaluateRoutes = require('./routes/internal/riskDecisionEvaluate');
const internalSanctionsScreeningRoutes = require('./routes/internal/sanctionsScreening');
const internalRiskActionsApplyRoutes = require('./routes/internal/riskActionsApply');
const internalReconciliationRunsRoutes = require('./routes/internal/reconciliationRuns');
const internalReconciliationRunDailyRoutes = require('./routes/internal/reconciliationRunDaily');
const internalReconciliationActionsRoutes = require('./routes/internal/reconciliationActions');
const internalStepUpStartRoutes = require('./routes/internal/stepUpStart');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
=======
// ---- Internal routers ----
const businessesInternal = require('./routes/internal/businesses');
const casesInternal = require('./routes/internal/cases');
const caseAssignmentsInternal = require('./routes/internal/caseAssignments');
const caseStateInternal = require('./routes/internal/caseState');
const caseEvidenceInternal = require('./routes/internal/caseEvidence');
const stepUpStartInternal = require('./routes/internal/stepUpStart');
const paymentsAchSubmitInternal = require('./routes/internal/paymentsAchSubmit');
const paymentsAchWebhookInternal = require('./routes/internal/paymentsAchWebhook');
const paymentIntentRiskGateInternal = require('./routes/internal/paymentIntentRiskGate');

// Stage 4C / 4E
const reconciliationRunDaily = require('./routes/internal/reconciliationRunDaily');
const reconciliationRunsInternal = require('./routes/internal/reconciliationRuns');
const reconciliationActionsInternal = require('./routes/internal/reconciliationActions');

// Stage 5A / 5B / 5C / 5D
const internalCardsRouter = require('./routes/internal/cards');
const cardsAuthDecisionRouter = require('./routes/internal/cardsAuthDecision');
const cardsAuthorizationWebhookRouter = require('./routes/internal/cardsAuthorizationWebhook');
const cardsFinancialWebhookRouter = require('./routes/internal/cardsFinancialWebhook');

// Stage 6A
const riskSignalsIngestRouter = require('./routes/internal/riskSignalsIngest');
const riskDecisionEvaluateRouter = require('./routes/internal/riskDecisionEvaluate');

// Ledger domain HTTP adapters
const ledgerCreateHoldRouter = require('./routes/internal/ledgerHoldsCreate');
const ledgerReleaseHoldRouter = require('./routes/internal/ledgerHoldsRelease');
const ledgerBalancesRouter = require('./routes/internal/ledgerAccountsBalance');
const ledgerEnsureWalletRouter = require('./routes/internal/ledgerEnsureWallet');
const ledgerPostingsCommitRouter = require('./routes/internal/ledgerPostingsCommit');

const app = express();

app.set('trust proxy', true);

app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
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
app.use('/internal/v1/payments', paymentIntentRiskGateInternal);

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

// Stage 5D
app.use('/internal/v1/cards', cardsFinancialWebhookRouter);

// Stage 6A
app.use('/internal/v1/risk', riskSignalsIngestRouter);
app.use('/internal/v1/risk', riskDecisionEvaluateRouter);

// Stage 5C - Ledger internal routes mounted in gateway-api
app.use('/internal/v1/ledger', ledgerCreateHoldRouter);
app.use('/internal/v1/ledger', ledgerReleaseHoldRouter);
app.use('/internal/v1/ledger', ledgerBalancesRouter);
app.use('/internal/v1/ledger', ledgerEnsureWalletRouter);
app.use('/internal/v1/ledger', ledgerPostingsCommitRouter);

// =============================
// BASIC ROUTES
// =============================

app.get('/', (_req, res) => {
  res.status(200).send('OK - gateway-api up');
});
>>>>>>> 42b376a (Stage 6B — Payment Intent Risk Gate)

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'gateway-api',
<<<<<<< HEAD
    timestamp: new Date().toISOString()
=======
    env: process.env.NODE_ENV || 'development'
>>>>>>> 42b376a (Stage 6B — Payment Intent Risk Gate)
  });
});

app.use('/public/v1/identity', identityRoutes);
app.use('/public/v1/finance/payment-intents', paymentIntentsRoutes);
app.use('/public/v1/finance/approvals', approvalsRoutes);
app.use('/public/v1/financial-inbox', financialInboxRoutes);
app.use('/public/v1/cards/disputes', cardsDisputesRoutes);
app.use('/public/v1/auth/step-up', stepUpRoutes);

app.use('/internal/v1/businesses', internalBusinessesRoutes);

app.use('/internal/v1/case-management/cases', internalCasesRoutes);
app.use('/internal/v1/case-management/cases', internalCaseAssignmentsRoutes);
app.use('/internal/v1/case-management/cases', internalCaseEvidenceRoutes);
app.use('/internal/v1/case-management/cases', internalCaseStateRoutes);

app.use('/internal/v1/cards', internalCardsRoutes);
app.use('/internal/v1/cards', internalCardsAuthDecisionRoutes);
app.use('/internal/v1/cards', internalCardsAuthorizationWebhookRoutes);
app.use('/internal/v1/cards', internalCardsFinancialWebhookRoutes);

app.use('/internal/v1/ledger', internalLedgerEnsureWalletRoutes);
app.use('/internal/v1/ledger', internalLedgerAccountsBalanceRoutes);
app.use('/internal/v1/ledger', internalLedgerHoldsCreateRoutes);
app.use('/internal/v1/ledger', internalLedgerHoldsReleaseRoutes);
app.use('/internal/v1/ledger', internalLedgerPostingsCommitRoutes);

app.use('/internal/v1/payments', internalPaymentsAchSubmitRoutes);
app.use('/internal/v1/payments', internalPaymentsAchWebhookRoutes);
app.use('/internal/v1/payments', internalPaymentIntentRiskGateRoutes);

app.use('/internal/v1/risk', internalRiskSignalsIngestRoutes);
app.use('/internal/v1/risk', internalRiskDecisionEvaluateRoutes);
app.use('/internal/v1/risk', internalSanctionsScreeningRoutes);
app.use('/internal/v1/risk', internalRiskActionsApplyRoutes);

app.use('/internal/v1/reconciliation/runs', internalReconciliationRunsRoutes);
app.use('/internal/v1/reconciliation/runs', internalReconciliationRunDailyRoutes);
app.use('/internal/v1/reconciliation/actions', internalReconciliationActionsRoutes);

app.use('/internal/v1/step-up', internalStepUpStartRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
<<<<<<< HEAD
    message: `Route not found: ${req.method} ${req.originalUrl}`
=======
    path: req.originalUrl
>>>>>>> 42b376a (Stage 6B — Payment Intent Risk Gate)
  });
});

app.use((err, _req, res, _next) => {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const code = err?.code || (status >= 500 ? 'internal_error' : 'request_error');
  const message = status >= 500
    ? 'Internal server error'
    : (err?.message || 'Request failed');

  if (status >= 500) {
    console.error('[gateway-api] unhandled error', err);
  }

  const body = {
    error: code,
    message
  };

<<<<<<< HEAD
  if (err?.details) {
    body.details = err.details;
  }

  res.status(status).json(body);
=======
  res.status(Number.isFinite(status) ? status : 500).json({
    error: 'internal_error',
    message: err?.message || 'unknown'
  });
>>>>>>> 42b376a (Stage 6B — Payment Intent Risk Gate)
});

const port = Number(process.env.PORT || 3000);
const server = http.createServer(app);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[gateway-api] received ${signal}, starting graceful shutdown`);

  server.close((err) => {
    if (err) {
      console.error('[gateway-api] error during server shutdown', err);
      process.exit(1);
      return;
    }

    console.log('[gateway-api] shutdown complete');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[gateway-api] forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
<<<<<<< HEAD
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(port, () => {
  console.log(`[gateway-api] listening on port ${port}`);
});

module.exports = {
  app,
  server
};
=======
process.on('SIGTERM', () => shutdown('SIGTERM'));
>>>>>>> 42b376a (Stage 6B — Payment Intent Risk Gate)
