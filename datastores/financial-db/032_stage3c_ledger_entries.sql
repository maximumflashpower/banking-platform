BEGIN;

CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    debit_account_id TEXT NOT NULL,
    credit_account_id TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_debit
    ON ledger_entries(debit_account_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_credit
    ON ledger_entries(credit_account_id);

COMMIT;