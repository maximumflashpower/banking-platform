CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL,
  scope           text NOT NULL,       -- 'POST /internal/v1/ledger/postings/commit'
  idem_key        text NOT NULL,       -- header Idempotency-Key
  request_hash    text NOT NULL,       -- hash(body canonical)
  response_json   jsonb NOT NULL,      -- guarda respuesta (ej: journal_entry_id)
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(space_id, scope, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_space_scope ON idempotency_keys(space_id, scope);