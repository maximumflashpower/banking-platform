CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS financial_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL,
  event_type      text NOT NULL,
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  payload         jsonb NOT NULL,

  headers         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  available_at    timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  last_error      text,

  correlation_id  text NOT NULL,
  idempotency_key text NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE financial_outbox
  ADD COLUMN IF NOT EXISTS headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_outbox_status_check'
  ) THEN
    ALTER TABLE financial_outbox
      ADD CONSTRAINT financial_outbox_status_check
      CHECK (status IN ('pending', 'processing', 'published', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_outbox_status_available
  ON financial_outbox(status, available_at);

CREATE INDEX IF NOT EXISTS idx_financial_outbox_event_type
  ON financial_outbox(event_type);

CREATE INDEX IF NOT EXISTS idx_financial_outbox_aggregate
  ON financial_outbox(aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS idx_financial_outbox_correlation_id
  ON financial_outbox(correlation_id);

CREATE OR REPLACE FUNCTION financial_outbox_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_financial_outbox_updated_at
ON financial_outbox;

CREATE TRIGGER trg_financial_outbox_updated_at
BEFORE UPDATE ON financial_outbox
FOR EACH ROW
EXECUTE FUNCTION financial_outbox_set_updated_at();