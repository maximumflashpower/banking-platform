BEGIN;

CREATE TABLE IF NOT EXISTS personal_kyc_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    space_id TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN (
            'not_started',
            'pending_documents',
            'under_review',
            'verified',
            'rejected'
        )),

    document_front_url TEXT,
    document_back_url TEXT,
    selfie_url TEXT,
    liveness_video_url TEXT,

    face_match_score NUMERIC(5,4),
    liveness_score NUMERIC(5,4),

    identity_verified_at TIMESTAMPTZ NULL,
    rejection_reason TEXT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT personal_kyc_sessions_user_space_unique UNIQUE (user_id, space_id),
    CONSTRAINT personal_kyc_sessions_face_match_score_range
        CHECK (face_match_score IS NULL OR (face_match_score >= 0 AND face_match_score <= 1)),
    CONSTRAINT personal_kyc_sessions_liveness_score_range
        CHECK (liveness_score IS NULL OR (liveness_score >= 0 AND liveness_score <= 1)),
    CONSTRAINT personal_kyc_sessions_verified_requires_timestamp
        CHECK (status <> 'verified' OR identity_verified_at IS NOT NULL),
    CONSTRAINT personal_kyc_sessions_rejected_requires_reason
        CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_personal_kyc_sessions_user_id
    ON personal_kyc_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_personal_kyc_sessions_space_id
    ON personal_kyc_sessions (space_id);

CREATE INDEX IF NOT EXISTS idx_personal_kyc_sessions_status
    ON personal_kyc_sessions (status);

COMMIT;