begin;

alter table if exists public.cards_outbox
  add column if not exists claimed_at timestamptz null,
  add column if not exists claimed_by text null;

create index if not exists idx_cards_outbox_publishable
  on public.cards_outbox (status, available_at, created_at, id);

create index if not exists idx_cards_outbox_claimed
  on public.cards_outbox (claimed_at)
  where status = 'pending';

create table if not exists public.card_event_inbox (
  id uuid primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  ordering_key text null,
  aggregate_id text null,
  payload jsonb not null,
  occurred_at timestamptz null,
  received_at timestamptz not null default now(),
  process_status text not null default 'pending',
  process_attempts integer not null default 0,
  processed_at timestamptz null,
  claimed_at timestamptz null,
  claimed_by text null,
  last_error text null,
  duplicate_of uuid null,
  constraint uq_card_event_inbox_provider_event unique (provider, provider_event_id),
  constraint chk_card_event_inbox_status check (
    process_status in (
      'pending',
      'processing',
      'processed',
      'duplicate',
      'deferred',
      'failed_retryable',
      'failed_terminal'
    )
  )
);

create index if not exists idx_card_event_inbox_pending
  on public.card_event_inbox (process_status, received_at, id)
  where process_status in ('pending', 'failed_retryable', 'deferred');

create index if not exists idx_card_event_inbox_ordering
  on public.card_event_inbox (ordering_key, occurred_at, received_at);

create index if not exists idx_card_event_inbox_claimed
  on public.card_event_inbox (claimed_at)
  where process_status in ('pending', 'failed_retryable', 'deferred');

create table if not exists public.card_pending_reversals (
  id uuid primary key,
  provider text not null,
  provider_reversal_id text not null,
  authorization_id uuid null,
  provider_capture_id text null,
  amount bigint not null,
  currency text not null,
  payload jsonb not null,
  status text not null default 'pending_capture_anchor',
  linked_capture_id uuid null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint uq_card_pending_reversal_provider_id unique (provider, provider_reversal_id),
  constraint chk_card_pending_reversal_status check (
    status in ('pending_capture_anchor', 'resolved', 'discarded')
  )
);

create index if not exists idx_card_pending_reversals_pending
  on public.card_pending_reversals (status, created_at)
  where status = 'pending_capture_anchor';

create index if not exists idx_card_pending_reversals_linking
  on public.card_pending_reversals (provider_capture_id, authorization_id, amount, currency);

alter table if exists public.card_captures
  add column if not exists provider_capture_id text null;

create unique index if not exists uq_card_captures_provider_capture_id
  on public.card_captures (provider_capture_id)
  where provider_capture_id is not null;

alter table if exists public.card_reversals
  add column if not exists provider_reversal_id text null,
  add column if not exists capture_id uuid null;

create unique index if not exists uq_card_reversals_provider_reversal_id
  on public.card_reversals (provider_reversal_id)
  where provider_reversal_id is not null;

create index if not exists idx_card_reversals_capture_id
  on public.card_reversals (capture_id)
  where capture_id is not null;

commit;