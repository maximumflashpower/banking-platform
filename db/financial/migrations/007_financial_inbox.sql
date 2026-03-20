BEGIN;

CREATE TABLE IF NOT EXISTS financial_inbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_inbox_reference
  ON financial_inbox_events (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_financial_inbox_event_type
  ON financial_inbox_events (event_type);

COMMIT;