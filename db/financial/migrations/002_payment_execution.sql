BEGIN;

CREATE TABLE IF NOT EXISTS payment_intent_executions (
  id BIGSERIAL PRIMARY KEY,
  payment_intent_id TEXT NOT NULL UNIQUE
    REFERENCES payment_intents_core(id)
    ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash VARCHAR(64) NOT NULL,
  execution_status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (execution_status IN ('recorded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intent_executions_created_at
  ON payment_intent_executions (created_at DESC);

COMMIT;
