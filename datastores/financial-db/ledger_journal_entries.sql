CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ledger_journal_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     uuid NOT NULL,
  memo         text NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_je_space_created ON ledger_journal_entries(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_je_space_effective ON ledger_journal_entries(space_id, effective_at DESC);