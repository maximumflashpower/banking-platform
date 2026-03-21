BEGIN;

CREATE TABLE IF NOT EXISTS aml_reviews (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id UUID NOT NULL,
    trigger_source TEXT NOT NULL,
    trigger_reason TEXT NOT NULL,
    risk_decision_id UUID NULL,
    review_status TEXT NOT NULL DEFAULT 'open',
    requires_sar BOOLEAN NOT NULL DEFAULT FALSE,
    requires_bank_escalation BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT aml_reviews_review_status_chk CHECK (
        review_status IN (
            'open',
            'in_review',
            'sar_required',
            'sar_prepared',
            'sar_submitted',
            'bank_escalation_required',
            'escalated_to_bank',
            'closed'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_aml_reviews_case_id
    ON aml_reviews(case_id);

CREATE INDEX IF NOT EXISTS idx_aml_reviews_subject
    ON aml_reviews(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS bank_escalations (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    package_status TEXT NOT NULL DEFAULT 'prepared',
    package_payload_json JSONB NOT NULL,
    submitted_at TIMESTAMPTZ NULL,
    submitted_by UUID NULL,
    bank_reference TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bank_escalations_status_chk CHECK (
        package_status IN (
            'prepared',
            'requested',
            'submitted',
            'acknowledged',
            'closed'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_bank_escalations_case_id
    ON bank_escalations(case_id);

COMMIT;