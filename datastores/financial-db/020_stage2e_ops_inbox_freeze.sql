BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;

CREATE OR REPLACE FUNCTION ops.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ops.space_status (
  space_uuid     uuid PRIMARY KEY,
  status         text NOT NULL DEFAULT 'active',
  freeze_source  text,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ops.space_status
  DROP CONSTRAINT IF EXISTS space_status_status_chk;
ALTER TABLE ops.space_status
  ADD CONSTRAINT space_status_status_chk
  CHECK (status IN ('active','frozen'));

ALTER TABLE ops.space_status
  DROP CONSTRAINT IF EXISTS space_status_freeze_source_chk;
ALTER TABLE ops.space_status
  ADD CONSTRAINT space_status_freeze_source_chk
  CHECK (freeze_source IS NULL OR freeze_source IN ('risk','support','bank','system'));

CREATE INDEX IF NOT EXISTS idx_space_status_status
  ON ops.space_status (status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ops_space_status_updated_at') THEN
    CREATE TRIGGER trg_ops_space_status_updated_at
    BEFORE UPDATE ON ops.space_status
    FOR EACH ROW
    EXECUTE FUNCTION ops.set_updated_at();
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS ops.financial_inbox_messages (
  id             uuid PRIMARY KEY,
  space_uuid     uuid NOT NULL,
  type           text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_inbox_space_created
  ON ops.financial_inbox_messages (space_uuid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fin_inbox_correlation
  ON ops.financial_inbox_messages (correlation_id);

CREATE INDEX IF NOT EXISTS idx_fin_inbox_type
  ON ops.financial_inbox_messages (type);

CREATE TABLE IF NOT EXISTS ops.financial_inbox_ack (
  id         uuid PRIMARY KEY,
  space_uuid uuid NOT NULL,
  message_id uuid NOT NULL,
  actor_id   text,
  note       text,
  acked_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_inbox_ack_space_message
  ON ops.financial_inbox_ack (space_uuid, message_id);

CREATE INDEX IF NOT EXISTS idx_fin_inbox_ack_message
  ON ops.financial_inbox_ack (message_id);

CREATE INDEX IF NOT EXISTS idx_fin_inbox_ack_space_acked
  ON ops.financial_inbox_ack (space_uuid, acked_at DESC);

COMMIT;
