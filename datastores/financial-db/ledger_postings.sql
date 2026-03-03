CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ledger_postings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id         uuid NOT NULL,
  journal_entry_id uuid NOT NULL REFERENCES ledger_journal_entries(id),
  account_id       uuid NOT NULL REFERENCES ledger_accounts(id),
  direction        text NOT NULL,      -- DEBIT|CREDIT
  amount_minor     bigint NOT NULL,    -- minor units; >0
  currency         char(3) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CHECK (direction IN ('DEBIT','CREDIT')),
  CHECK (amount_minor > 0)
);

-- Para balances rápidos por cuenta:
CREATE INDEX IF NOT EXISTS idx_ledger_postings_space_account ON ledger_postings(space_id, account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_space_currency ON ledger_postings(space_id, currency);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_je ON ledger_postings(journal_entry_id);