BEGIN;

CREATE TABLE IF NOT EXISTS ledger_wallet_accounts (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    account_code TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'wallet_liability'
        CHECK (account_type IN ('wallet_liability')),
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ledger_wallet_accounts_wallet_unique UNIQUE (wallet_id),
    CONSTRAINT ledger_wallet_accounts_account_code_unique UNIQUE (account_code)
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_accounts_user_id
    ON ledger_wallet_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_accounts_space_id
    ON ledger_wallet_accounts(space_id);

COMMIT;