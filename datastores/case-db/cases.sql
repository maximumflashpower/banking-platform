create table if not exists cases (
  id uuid primary key,
  case_number bigint generated always as identity unique,

  domain varchar(32) not null check (
    domain in ('aml_risk', 'support', 'disputes', 'recovery', 'legal_hold')
  ),

  origin varchar(32) not null check (
    origin in (
      'risk_signal',
      'payment_rejection',
      'fraud_detection',
      'user_report',
      'support_ticket',
      'manual'
    )
  ),

  state varchar(32) not null check (
    state in ('open', 'in_review', 'escalated', 'resolved', 'closed')
  ),

  priority varchar(16) not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),

  severity varchar(16) not null default 'medium' check (
    severity in ('low', 'medium', 'high', 'critical')
  ),

  title varchar(200) not null,
  summary text not null,

  business_id uuid null,
  user_id uuid null,

  source_system varchar(64) null,
  source_reference varchar(128) null,

  external_object_type varchar(64) null,
  external_object_id varchar(128) null,

  opened_at timestamptz not null default now(),
  resolved_at timestamptz null,
  closed_at timestamptz null,

  resolution_code varchar(64) null,
  closure_reason varchar(128) null,

  current_assignment_id uuid null,

  dedupe_key varchar(256) null,
  idempotency_key varchar(128) not null,
  correlation_id varchar(128) null,
  request_id varchar(128) null,

  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_cases_idempotency unique (idempotency_key),
  constraint uq_cases_dedupe unique (dedupe_key),

  constraint chk_cases_resolved_fields check (
    (state <> 'resolved')
    or
    (resolved_at is not null and resolution_code is not null)
  ),

  constraint chk_cases_closed_fields check (
    (state <> 'closed')
    or
    (closed_at is not null and closure_reason is not null)
  )
);

create index if not exists idx_cases_domain_state
  on cases (domain, state, priority desc, created_at desc);

create index if not exists idx_cases_business
  on cases (business_id, created_at desc);

create index if not exists idx_cases_user
  on cases (user_id, created_at desc);

create index if not exists idx_cases_external_object
  on cases (external_object_type, external_object_id);

create index if not exists idx_cases_origin_source
  on cases (origin, source_system, source_reference);
