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