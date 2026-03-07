CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_token text NOT NULL UNIQUE,
  business_id text NULL,
  user_id text NULL,
  space_uuid uuid NULL,
  program_id text NULL,
  brand text NULL,
  network text NULL,
  last4 text NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  exp_month int NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year int NULL CHECK (exp_year >= 2000),
  cardholder_name text NULL,
  status text NOT NULL CHECK (status IN ('active', 'frozen', 'closed')),
  freeze_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_created_at
  ON cards (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cards_business_id
  ON cards (business_id);

CREATE INDEX IF NOT EXISTS idx_cards_user_id
  ON cards (user_id);

CREATE INDEX IF NOT EXISTS idx_cards_space_uuid
  ON cards (space_uuid);

CREATE INDEX IF NOT EXISTS idx_cards_status
  ON cards (status);

CREATE TABLE IF NOT EXISTS card_controls_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  atm_enabled boolean NOT NULL DEFAULT true,
  ecommerce_enabled boolean NOT NULL DEFAULT true,
  international_enabled boolean NOT NULL DEFAULT true,
  contactless_enabled boolean NOT NULL DEFAULT true,
  daily_spend_limit numeric(18,2) NULL,
  monthly_spend_limit numeric(18,2) NULL,
  single_tx_limit numeric(18,2) NULL,
  currency text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id)
);

CREATE TABLE IF NOT EXISTS cards_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  card_token text NULL,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'failed', 'ignored')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  error_text text NULL,
  correlation_id text NULL,
  idempotency_key text NULL,
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_cards_webhook_events_status_received_at
  ON cards_webhook_events (processing_status, received_at DESC);

CREATE TABLE IF NOT EXISTS cards_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  last_error text NULL,
  correlation_id text NULL,
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_outbox_status_available_at
  ON cards_outbox (status, available_at, created_at);

CREATE INDEX IF NOT EXISTS idx_cards_outbox_aggregate
  ON cards_outbox (aggregate_type, aggregate_id);