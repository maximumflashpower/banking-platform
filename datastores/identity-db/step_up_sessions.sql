create table if not exists step_up_sessions (
  id uuid primary key,
  session_id uuid not null,
  user_id uuid not null,
  business_id uuid null,

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

  created_by uuid not null,
  updated_by uuid not null,
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
