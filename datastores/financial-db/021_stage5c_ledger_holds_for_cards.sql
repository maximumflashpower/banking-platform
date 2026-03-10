BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ledger_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  space_id UUID NOT NULL,
  hold_ref TEXT NOT NULL,
  external_ref TEXT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'released')),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  released_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hold_ref)
);

CREATE INDEX IF NOT EXISTS idx_ledger_holds_account_id
  ON ledger_holds(account_id);

CREATE INDEX IF NOT EXISTS idx_ledger_holds_space_id
  ON ledger_holds(space_id);

CREATE INDEX IF NOT EXISTS idx_ledger_holds_status
  ON ledger_holds(status);

CREATE INDEX IF NOT EXISTS idx_ledger_holds_account_status
  ON ledger_holds(account_id, status);

COMMIT;