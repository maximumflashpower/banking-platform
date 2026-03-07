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