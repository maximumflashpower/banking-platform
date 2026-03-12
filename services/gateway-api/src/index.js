'use strict';

const http = require('http');
const express = require('express');

const identityRoutes = require('./routes/identity');
const paymentIntentsRoutes = require('./routes/paymentIntents');
const approvalsRoutes = require('./routes/approvals');
const financialInboxRoutes = require('./routes/financialInbox');
const cardsDisputesRoutes = require('./routes/cardsDisputes');
const stepUpRoutes = require('./routes/stepUp');

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

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'gateway-api',
    timestamp: new Date().toISOString()
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
    message: `Route not found: ${req.method} ${req.originalUrl}`
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

  if (err?.details) {
    body.details = err.details;
  }

  res.status(status).json(body);
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
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(port, () => {
  console.log(`[gateway-api] listening on port ${port}`);
});

module.exports = {
  app,
  server
};
