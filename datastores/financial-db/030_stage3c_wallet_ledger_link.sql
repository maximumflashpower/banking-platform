BEGIN;

ALTER TABLE personal_wallets
ADD COLUMN IF NOT EXISTS ledger_account_id TEXT NULL,
ADD COLUMN IF NOT EXISTS ledger_status TEXT NOT NULL DEFAULT 'not_provisioned'
    CHECK (ledger_status IN ('not_provisioned', 'provisioned', 'failed')),
ADD COLUMN IF NOT EXISTS ledger_last_error TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_wallets_ledger_status
    ON personal_wallets(ledger_status);

COMMIT;