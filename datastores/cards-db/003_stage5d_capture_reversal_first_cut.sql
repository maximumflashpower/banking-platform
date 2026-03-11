CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Extender lifecycle de auth
ALTER TABLE card_authorizations
  DROP CONSTRAINT IF EXISTS card_authorizations_status_check;

ALTER TABLE card_authorizations
  ADD CONSTRAINT card_authorizations_status_check
  CHECK (status IN ('received', 'decisioned', 'captured', 'reversed'));

-- 2. Captures
CREATE TABLE IF NOT EXISTS card_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id uuid NOT NULL REFERENCES card_authorizations(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_auth_id text NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  capture_type text NOT NULL DEFAULT 'total'
    CHECK (capture_type IN ('total')),
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted')),
  ledger_journal_entry_id uuid NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(provider, provider_event_id),
  UNIQUE(authorization_id)
);

CREATE INDEX IF NOT EXISTS idx_card_captures_auth_created_at
  ON card_captures(authorization_id, created_at DESC);

-- 3. Reversals
CREATE TABLE IF NOT EXISTS card_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id uuid NOT NULL REFERENCES card_authorizations(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_auth_id text NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted')),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(provider, provider_event_id),
  UNIQUE(authorization_id)
);

CREATE INDEX IF NOT EXISTS idx_card_reversals_auth_created_at
  ON card_reversals(authorization_id, created_at DESC);

-- 4. Settlements base
CREATE TABLE IF NOT EXISTS card_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id uuid NOT NULL REFERENCES card_authorizations(id),
  capture_id uuid NULL REFERENCES card_captures(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_auth_id text NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  settlement_type text NOT NULL DEFAULT 'capture_total'
    CHECK (settlement_type IN ('capture_total')),
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted')),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  settled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(provider, provider_event_id),
  UNIQUE(capture_id)
);

CREATE INDEX IF NOT EXISTS idx_card_settlements_auth_created_at
  ON card_settlements(authorization_id, created_at DESC);