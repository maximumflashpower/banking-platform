\connect financial_db

-- Ledger core (ETAPA 2B)
-- (copia/pega aquí el contenido de tus SQL para que se aplique en initdb)

-- 1) accounts
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     uuid NOT NULL,
  code         text NOT NULL,
  name         text NOT NULL,
  type         text NOT NULL,
  currency     char(3) NOT NULL,
  normal_side  text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(space_id, code),
  CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  CHECK (normal_side IN ('DEBIT','CREDIT')),
  CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_space ON ledger_accounts(space_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_space_currency ON ledger_accounts(space_id, currency);

-- 2) journal entries
CREATE TABLE IF NOT EXISTS ledger_journal_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     uuid NOT NULL,
  memo         text NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_je_space_created ON ledger_journal_entries(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_je_space_effective ON ledger_journal_entries(space_id, effective_at DESC);

-- 3) postings
CREATE TABLE IF NOT EXISTS ledger_postings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id         uuid NOT NULL,
  journal_entry_id uuid NOT NULL REFERENCES ledger_journal_entries(id),
  account_id       uuid NOT NULL REFERENCES ledger_accounts(id),
  direction        text NOT NULL,
  amount_minor     bigint NOT NULL,
  currency         char(3) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (direction IN ('DEBIT','CREDIT')),
  CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_space_account ON ledger_postings(space_id, account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_space_currency ON ledger_postings(space_id, currency);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_je ON ledger_postings(journal_entry_id);

-- 4) outbox (append-only)
CREATE TABLE IF NOT EXISTS financial_outbox (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL,
  event_type      text NOT NULL,
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_outbox_created ON financial_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_fin_outbox_space_created ON financial_outbox(space_id, created_at);

-- 5) idempotency (append-only)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL,
  scope           text NOT NULL,
  idem_key        text NOT NULL,
  request_hash    text NOT NULL,
  response_json   jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(space_id, scope, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_space_scope ON idempotency_keys(space_id, scope);