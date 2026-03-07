CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reconciliation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_run_id UUID NOT NULL UNIQUE,
  severity TEXT NOT NULL CHECK (severity IN ('none', 'low', 'medium', 'high', 'critical')),
  should_create_case BOOLEAN NOT NULL DEFAULT FALSE,
  should_alert BOOLEAN NOT NULL DEFAULT FALSE,
  should_freeze BOOLEAN NOT NULL DEFAULT FALSE,
  freeze_requested BOOLEAN NOT NULL DEFAULT FALSE,
  case_id UUID NULL,
  financial_inbox_message_id UUID NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_reconciliation_actions_run
    FOREIGN KEY (reconciliation_run_id)
    REFERENCES reconciliation_runs(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_actions_severity
  ON reconciliation_actions (severity);

CREATE INDEX IF NOT EXISTS idx_reconciliation_actions_created_at
  ON reconciliation_actions (created_at DESC);

CREATE OR REPLACE FUNCTION touch_reconciliation_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_reconciliation_actions_updated_at ON reconciliation_actions;

CREATE TRIGGER trg_touch_reconciliation_actions_updated_at
BEFORE UPDATE ON reconciliation_actions
FOR EACH ROW
EXECUTE FUNCTION touch_reconciliation_actions_updated_at();
