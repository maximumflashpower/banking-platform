create table if not exists card_disputes (
  id uuid primary key,
  space_id uuid not null,
  card_id uuid not null,
  authorization_id uuid null,
  capture_id uuid null,
  settlement_id uuid null,
  reason_code text not null,
  description text null,
  status text not null default 'opened'
    check (status in ('opened')),
  case_id uuid null,
  inbox_message_id uuid null,
  opened_by_user_id uuid null,
  idempotency_key text not null unique,
  correlation_id text null,
  request_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_disputes_space_created
  on card_disputes (space_id, created_at desc);

create index if not exists idx_card_disputes_card_created
  on card_disputes (card_id, created_at desc);

create index if not exists idx_card_disputes_case_id
  on card_disputes (case_id);