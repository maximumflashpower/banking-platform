BEGIN;

CREATE TABLE IF NOT EXISTS personal_financial_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    space_id TEXT NOT NULL,

    legal_name TEXT,
    date_of_birth DATE,
    country_of_residence TEXT,
    nationality TEXT,
    tax_id_last4 TEXT,
    occupation TEXT,
    source_of_funds TEXT,

    eligibility_status TEXT NOT NULL DEFAULT 'not_eligible'
        CHECK (eligibility_status IN (
            'not_eligible',
            'eligible',
            'restricted'
        )),

    eligibility_reason TEXT NULL,
    reviewed_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT personal_financial_profiles_user_space_unique
        UNIQUE (user_id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_financial_profiles_user_id
    ON personal_financial_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_personal_financial_profiles_space_id
    ON personal_financial_profiles(space_id);

CREATE INDEX IF NOT EXISTS idx_personal_financial_profiles_eligibility_status
    ON personal_financial_profiles(eligibility_status);

COMMIT;