ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_domain_check;
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_origin_check;

ALTER TABLE cases
  ADD CONSTRAINT cases_domain_check
  CHECK (
    domain IN ('aml_risk', 'support', 'disputes', 'recovery', 'legal_hold', 'operations')
  );

ALTER TABLE cases
  ADD CONSTRAINT cases_origin_check
  CHECK (
    origin IN (
      'risk_signal',
      'payment_rejection',
      'fraud_detection',
      'user_report',
      'support_ticket',
      'manual',
      'reconciliation_mismatch'
    )
  );
