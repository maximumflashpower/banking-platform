CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY,
  case_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,

  domain varchar(32) NOT NULL CHECK (
    domain IN ('aml_risk', 'support', 'disputes', 'recovery', 'legal_hold', 'operations')
  ),

  origin varchar(32) NOT NULL CHECK (
    origin IN (
      'risk_signal',
      'payment_rejection',
      'fraud_detection',
      'user_report',
      'support_ticket',
      'manual',
      'reconciliation_mismatch'
    )
  ),

  state varchar(32) NOT NULL CHECK (
    state IN ('open', 'in_review', 'escalated', 'resolved', 'closed')
  ),

  priority varchar(16) NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),

  severity varchar(16) NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),

  title varchar(200) NOT NULL,
  summary text NOT NULL,

  business_id uuid NULL,
  user_id uuid NULL,

  source_system varchar(64) NULL,
  source_reference varchar(128) NULL,

  external_object_type varchar(64) NULL,
  external_object_id varchar(128) NULL,

  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  closed_at timestamptz NULL,

  resolution_code varchar(64) NULL,
  closure_reason varchar(128) NULL,

  current_assignment_id uuid NULL,

  dedupe_key varchar(256) NULL,
  idempotency_key varchar(128) NOT NULL,
  correlation_id varchar(128) NULL,
  request_id varchar(128) NULL,

  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_cases_idempotency UNIQUE (idempotency_key),
  CONSTRAINT uq_cases_dedupe UNIQUE (dedupe_key),

  CONSTRAINT chk_cases_resolved_fields CHECK (
    (state <> 'resolved')
    OR
    (resolved_at IS NOT NULL AND resolution_code IS NOT NULL)
  ),

  CONSTRAINT chk_cases_closed_fields CHECK (
    (state <> 'closed')
    OR
    (closed_at IS NOT NULL AND closure_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cases_domain_state
  ON cases (domain, state, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_business
  ON cases (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_user
  ON cases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_external_object
  ON cases (external_object_type, external_object_id);

CREATE INDEX IF NOT EXISTS idx_cases_origin_source
  ON cases (origin, source_system, source_reference);