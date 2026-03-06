create table if not exists step_up_events (
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
  actor_id uuid null,

  attempt_number integer null check (attempt_number is null or attempt_number >= 1),

  device_id uuid null,
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
