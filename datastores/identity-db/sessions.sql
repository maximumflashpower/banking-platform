CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type text NOT NULL,
    space_id uuid,
    device_id uuid,
    status text NOT NULL DEFAULT 'active',
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    invalidated_at timestamptz,
    invalidated_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sessions_type_check CHECK (
        session_type IN ('social_session', 'financial_session')
    ),
    CONSTRAINT sessions_status_check CHECK (
        status IN ('active', 'expired', 'invalidated')
    )
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_type_status
ON sessions(session_type, status);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_space_id
ON sessions(space_id);