create table if not exists case_timeline (
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
  actor_id uuid null,

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
