CREATE TABLE IF NOT EXISTS user_credentials (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    credential_type text NOT NULL DEFAULT 'password',

    password_hash text NOT NULL,

    failed_attempts integer NOT NULL DEFAULT 0,

    locked_until timestamptz,

    password_updated_at timestamptz NOT NULL DEFAULT now(),

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT user_credentials_type_check
    CHECK (credential_type IN ('password'))
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user
ON user_credentials(user_id);