\connect financial_db;

create extension if not exists pgcrypto;

create table if not exists rails_transfers_ach (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null,
  provider text not null,
  provider_transfer_id text,
  amount numeric(18,2) not null,
  currency text not null,
  state text not null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rails_transfers_ach_provider_transfer_unique
  on rails_transfers_ach(provider, provider_transfer_id)
  where provider_transfer_id is not null;

create unique index if not exists rails_transfers_ach_payment_intent_idempotency_unique
  on rails_transfers_ach(payment_intent_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists rails_transfers_ach_payment_intent_idx
  on rails_transfers_ach(payment_intent_id);

create index if not exists rails_transfers_ach_state_idx
  on rails_transfers_ach(state);

create or replace function set_updated_at_rails_transfers_ach()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rails_transfers_ach_updated_at on rails_transfers_ach;

create trigger trg_rails_transfers_ach_updated_at
before update on rails_transfers_ach
for each row
execute function set_updated_at_rails_transfers_ach();