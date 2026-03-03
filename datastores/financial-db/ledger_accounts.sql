CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     uuid NOT NULL,
  code         text NOT NULL,
  name         text NOT NULL,
  type         text NOT NULL,        -- ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE
  currency     char(3) NOT NULL,
  normal_side  text NOT NULL,        -- DEBIT|CREDIT
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE(space_id, code),
  CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  CHECK (normal_side IN ('DEBIT','CREDIT')),
  CHECK (status IN ('active','archived'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_space ON ledger_accounts(space_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_space_currency ON ledger_accounts(space_id, currency);