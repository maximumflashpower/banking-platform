CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS financial_outbox (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL,
  event_type      text NOT NULL,     -- 'fin.ledger.journal_posted.v1' (ejemplo)
  aggregate_type  text NOT NULL,     -- 'ledger_journal_entry'
  aggregate_id    uuid NOT NULL,     -- journal_entry_id
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_outbox_created ON financial_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_fin_outbox_space_created ON financial_outbox(space_id, created_at);