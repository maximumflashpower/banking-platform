BEGIN;

CREATE TABLE IF NOT EXISTS personal_wallets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    space_id TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'inactive'
        CHECK (status IN (
            'inactive',
            'active',
            'suspended'
        )),

    wallet_type TEXT NOT NULL DEFAULT 'personal'
        CHECK (wallet_type IN ('personal')),

    currency TEXT NOT NULL DEFAULT 'USD',
    eligibility_snapshot TEXT NULL,
    kyc_snapshot TEXT NULL,

    activated_at TIMESTAMPTZ NULL,
    suspended_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT personal_wallets_user_space_unique UNIQUE (user_id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_wallets_user_id
    ON personal_wallets(user_id);

CREATE INDEX IF NOT EXISTS idx_personal_wallets_space_id
    ON personal_wallets(space_id);

CREATE INDEX IF NOT EXISTS idx_personal_wallets_status
    ON personal_wallets(status);

COMMIT;