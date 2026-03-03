-- 004_stage2a_kyc_profiles.sql
-- ETAPA 2A: KYC personal + gating

create table if not exists kyc_profiles (
  user_id text primary key references users(id) on delete cascade,

  status text not null default 'unverified'
    check (status in ('unverified','pending','verified','rejected')),

  provider text not null default 'stub',
  provider_ref text null,

  started_at timestamptz null,
  submitted_at timestamptz null,
  verified_at timestamptz null,
  rejected_at timestamptz null,

  rejection_reason text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kyc_profiles_status on kyc_profiles(status);

-- updated_at maintenance: mínimo (trigger simple)
create or replace function set_updated_at_kyc_profiles()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kyc_profiles_updated_at on kyc_profiles;
create trigger trg_kyc_profiles_updated_at
before update on kyc_profiles
for each row execute function set_updated_at_kyc_profiles();