'use strict';

const http = require('http');
const express = require('express');

const requestContext = require('./middleware/requestContext');
const requestLogging = require('./middleware/requestLogging');
const logger = require('./infrastructure/logger');

const identityRoutes = require('./routes/identity');
const kycRoutes = require('./routes/kyc');
const personalFinancialProfileRoutes = require('./routes/personalFinancialProfile');
const paymentIntentsRoutes = require('./routes/paymentIntents');
const approvalsRoutes = require('./routes/approvals');
const financialInboxRoutes = require('./routes/financialInbox');
const cardsDisputesRoutes = require('./routes/cardsDisputes');
const stepUpRoutes = require('./routes/stepUp');
const webQrSessionsRoutes = require('./routes/webQrSessions');
const socialRoutes = require('./routes/social');
const kycProtectedProbeRoutes = require('./routes/kycProtectedProbe');

const internalBusinessesRoutes = require('./routes/internal/businesses');
const internalCasesRoutes = require('./routes/internal/cases');
const internalCaseAssignmentsRoutes = require('./routes/internal/caseAssignments');
const internalCaseEvidenceRoutes = require('./routes/internal/caseEvidence');
const internalCaseStateRoutes = require('./routes/internal/caseState');
const internalCardsRoutes = require('./routes/internal/cards');
const internalCardsAuthDecisionRoutes = require('./routes/internal/cardsAuthDecision');
const internalCardsAuthorizationWebhookRoutes = require('./routes/internal/cardsAuthorizationWebhook');
const internalCardsFinancialWebhookRoutes = require('./routes/internal/cardsFinancialWebhook');
const internalKycRoutes = require('./routes/internal/kyc');
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
const internalAuditEvidenceRoutes = require('./routes/internal/auditEvidence');

const webSessionSecurityService = require('./services/identity/webSessionSecurityService');
const { getRailSwitches } = require('./services/resilience/railSwitches');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(requestContext);
app.use(requestLogging);

app.use(async (req, _res, next) => {
  try {
    if (req.path.startsWith('/public/v1/web/')) {
      await webSessionSecurityService.expireInactiveSessions();
    }
  } catch (err) {
    logger.warn('expire_inactive_sessions_failed', {
      request_id: req.requestContext?.requestId || null,
      correlation_id: req.requestContext?.correlationId || null,
      method: req.method,
      path: req.originalUrl || req.url,
      error_code: err?.code || null,
      error_message: err?.message || 'expireInactiveSessions failed',
    });
  }

  next();
});

app.get('/health', (req, res) => {
  const railSwitches = getRailSwitches();

  res.status(200).json({
    ok: true,
    service: 'gateway-api',
    timestamp: new Date().toISOString(),
    request_id: req.requestContext?.requestId || null,
    correlation_id: req.requestContext?.correlationId || null,
    rails: {
      ach_enabled: railSwitches.achEnabled,
      cards_enabled: railSwitches.cardsEnabled,
    },
  });
});

app.use('/public/v1/identity', identityRoutes);
app.use('/public/v1/kyc', kycRoutes);
app.use('/public/v1/kyc-protected', kycProtectedProbeRoutes);
app.use('/public/v1/finance/payment-intents', paymentIntentsRoutes);
app.use('/public/v1/finance/approvals', approvalsRoutes);
app.use('/public/v1/finance', personalFinancialProfileRoutes);
app.use('/public/v1/financial-inbox', financialInboxRoutes);
app.use('/public/v1/cards/disputes', cardsDisputesRoutes);
app.use('/public/v1/auth/step-up', stepUpRoutes);
app.use('/public/v1/web', webQrSessionsRoutes);
app.use('/public/v1/social/conversations', socialRoutes);

app.use('/internal/v1/businesses', internalBusinessesRoutes);
app.use('/internal/v1/case-management/cases', internalCasesRoutes);
app.use('/internal/v1/case-management/cases', internalCaseAssignmentsRoutes);
app.use('/internal/v1/case-management/cases', internalCaseEvidenceRoutes);
app.use('/internal/v1/case-management/cases', internalCaseStateRoutes);
app.use('/internal/v1/cards', internalCardsRoutes);
app.use('/internal/v1/cards', internalCardsAuthDecisionRoutes);
app.use('/internal/v1/cards', internalCardsAuthorizationWebhookRoutes);
app.use('/internal/v1/cards', internalCardsFinancialWebhookRoutes);
app.use('/internal/v1/kyc', internalKycRoutes);
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
app.use('/internal/v1', internalAuditEvidenceRoutes);

app.use((req, res) => {
  logger.warn('route_not_found', {
    request_id: req.requestContext?.requestId || null,
    correlation_id: req.requestContext?.correlationId || null,
    method: req.method,
    path: req.originalUrl || req.url,
  });

  res.status(404).json({
    error: 'not_found',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, _next) => {
  const status = Number.isInteger(err?.statusCode)
    ? err.statusCode
    : Number.isInteger(err?.status)
      ? err.status
      : 500;

  const error = err?.code || 'internal_error';
  const message = status >= 500
    ? 'Internal server error'
    : (err?.message || 'Request failed');

  logger.error('request_failed', {
    request_id: req.requestContext?.requestId || null,
    correlation_id: req.requestContext?.correlationId || null,
    method: req.method,
    path: req.originalUrl || req.url,
    status_code: status,
    error_code: error,
    error_message: err?.message || 'Unhandled error',
  });

  res.status(status).json({ error, message });
});

const port = Number(process.env.PORT || 3000);
const server = http.createServer(app);

server.listen(port, () => {
  const railSwitches = getRailSwitches();

  logger.info('gateway_api_listening', {
    port,
    rails: {
      ach_enabled: railSwitches.achEnabled,
      cards_enabled: railSwitches.cardsEnabled,
    },
  });
});

function shutdown(signal) {
  logger.info('gateway_api_shutdown_started', { signal });

  server.close(() => {
    logger.info('gateway_api_shutdown_complete', { signal });
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));