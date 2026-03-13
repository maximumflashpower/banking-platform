'use strict';

const http = require('http');
const express = require('express');

const identityRoutes = require('./routes/identity');
const paymentIntentsRoutes = require('./routes/paymentIntents');
const approvalsRoutes = require('./routes/approvals');
const financialInboxRoutes = require('./routes/financialInbox');
const cardsDisputesRoutes = require('./routes/cardsDisputes');
const stepUpRoutes = require('./routes/stepUp');
const webQrSessionsRoutes = require('./routes/webQrSessions');

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

const webSessionSecurityService = require('./services/identity/webSessionSecurityService');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(async (req, _res, next) => {
  try {
    if (req.path.startsWith('/public/v1/web/')) {
      await webSessionSecurityService.expireInactiveSessions();
    }
  } catch (_err) {
    // best effort
  }

  next();
});

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
app.use('/public/v1/web', webQrSessionsRoutes);

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
  console.error('[gateway-api] unhandled error', err);

  const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  const error = err?.code || 'internal_error';
  const message = status >= 500 ? 'Internal server error' : (err?.message || 'Request failed');

  res.status(status).json({ error, message });
});

const port = Number(process.env.PORT || 3000);
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`[gateway-api] listening on port ${port}`);
});

function shutdown(signal) {
  console.log(`[gateway-api] received ${signal}, starting graceful shutdown`);
  server.close(() => {
    console.log('[gateway-api] shutdown complete');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));