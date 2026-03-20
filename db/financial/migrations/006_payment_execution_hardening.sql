BEGIN;

ALTER TABLE payment_intent_executions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_intent_executions_started_at
  ON payment_intent_executions (started_at DESC);

COMMIT;