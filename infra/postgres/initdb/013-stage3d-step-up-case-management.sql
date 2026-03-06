-- ============================================
-- Stage 3D — Step-Up + Case Management
-- ============================================

-- ============================================
-- CASE DB
-- ============================================

CREATE DATABASE case_db;
GRANT ALL PRIVILEGES ON DATABASE case_db TO app;

-- ============================================
-- STEP-UP TABLES IN identity
-- ============================================

\connect identity;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS step_up_sessions (
  id uuid primary key,
  session_id text not null references sessions(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  business_id text null,

  purpose varchar(64) not null,
  target_type varchar(64) not null,
  target_id varchar(128) not null,

  state varchar(32) not null check (
    state in ('created', 'pending_verification', 'verified', 'expired', 'cancelled')
  ),

  verification_method varchar(32) null check (
    verification_method in ('otp', 'device', 'biometric')
  ),

  required_level varchar(32) not null default 'standard' check (
    required_level in ('standard', 'high')
  ),

  challenge_reference varchar(128) null,
  attempts_count integer not null default 0 check (attempts_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),

  requested_at timestamptz not null default now(),
  verified_at timestamptz null,
  expires_at timestamptz not null,
  cancelled_at timestamptz null,

  idempotency_key varchar(128) not null,
  correlation_id varchar(128) null,
  request_id varchar(128) null,

  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_step_up_sessions_idempotency unique (idempotency_key)
);

create unique index if not exists uq_step_up_sessions_active_target
  on step_up_sessions (session_id, purpose, target_type, target_id)
  where state in ('created', 'pending_verification');

create index if not exists idx_step_up_sessions_user_state
  on step_up_sessions (user_id, state, expires_at desc);

create index if not exists idx_step_up_sessions_target
  on step_up_sessions (target_type, target_id, created_at desc);

create index if not exists idx_step_up_sessions_business
  on step_up_sessions (business_id, state, created_at desc);

CREATE TABLE IF NOT EXISTS step_up_events (
  id uuid primary key,
  step_up_session_id uuid not null references step_up_sessions(id) on delete cascade,

  event_type varchar(64) not null check (
    event_type in (
      'step_up_created',
      'verification_requested',
      'verification_succeeded',
      'verification_failed',
      'step_up_verified',
      'step_up_expired',
      'step_up_cancelled'
    )
  ),

  from_state varchar(32) null,
  to_state varchar(32) null,

  actor_type varchar(32) not null check (
    actor_type in ('user', 'system', 'admin', 'risk_engine')
  ),
  actor_id text null,

  attempt_number integer null check (attempt_number is null or attempt_number >= 1),

  device_id text null,
  ip_address inet null,
  user_agent text null,

  metadata jsonb not null default '{}'::jsonb,

  idempotency_key varchar(128) not null,
  correlation_id varchar(128) null,
  request_id varchar(128) null,

  created_at timestamptz not null default now(),

  constraint uq_step_up_events_idempotency unique (idempotency_key)
);

create index if not exists idx_step_up_events_session_created
  on step_up_events (step_up_session_id, created_at asc);

create index if not exists idx_step_up_events_type_created
  on step_up_events (event_type, created_at desc);

-- ============================================
-- CASE MANAGEMENT TABLES IN case_db
-- ============================================

\connect case_db;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cases (
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

  business_id text null,
  user_id text null,

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

  created_by text not null,
  updated_by text not null,
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

CREATE TABLE IF NOT EXISTS case_timeline (
  id uuid primary key,
  case_id uuid not null references cases(id) on delete cascade,

  event_type varchar(64) not null check (
    event_type in (
      'case_created',
      'case_assigned',
      'case_status_changed',
      'evidence_added',
      'note_added',
      'case_closed'
    )
  ),

  from_state varchar(32) null,
  to_state varchar(32) null,

  actor_type varchar(32) not null check (
    actor_type in ('user', 'system', 'admin', 'analyst', 'risk_engine')
  ),
  actor_id text null,

  visible_to_customer boolean not null default false,
  entry_text text null,
  metadata jsonb not null default '{}'::jsonb,

  idempotency_key varchar(128) not null,
  correlation_id varchar(128) null,
  request_id varchar(128) null,

  created_at timestamptz not null default now(),

  constraint uq_case_timeline_idempotency unique (idempotency_key)
);

create index if not exists idx_case_timeline_case_created
  on case_timeline (case_id, created_at asc);

create index if not exists idx_case_timeline_event_type
  on case_timeline (event_type, created_at desc);

CREATE TABLE IF NOT EXISTS case_assignments (
  id uuid primary key,
  case_id uuid not null references cases(id) on delete cascade,

  assignee_type varchar(32) not null check (
    assignee_type in ('user', 'queue', 'team')
  ),
  assignee_id varchar(128) not null,

  assigned_by text not null,
  assigned_reason varchar(256) null,

  active boolean not null default true,

  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz null,

  idempotency_key varchar(128) not null,
  correlation_id varchar(128) null,
  request_id varchar(128) null,

  created_at timestamptz not null default now(),

  constraint uq_case_assignments_idempotency unique (idempotency_key),

  constraint chk_case_assignments_active_window check (
    (active = true and unassigned_at is null)
    or
    (active = false and unassigned_at is not null)
  )
);

create unique index if not exists uq_case_assignments_one_active
  on case_assignments (case_id)
  where active = true;

create index if not exists idx_case_assignments_assignee
  on case_assignments (assignee_type, assignee_id, active, assigned_at desc);

create index if not exists idx_case_assignments_case_history
  on case_assignments (case_id, assigned_at desc);

alter table cases
  drop constraint if exists fk_cases_current_assignment;

alter table cases
  add constraint fk_cases_current_assignment
  foreign key (current_assignment_id)
  references case_assignments(id);
