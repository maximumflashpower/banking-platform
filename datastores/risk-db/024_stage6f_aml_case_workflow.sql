BEGIN;

CREATE TABLE IF NOT EXISTS aml_case_reviews (
    case_id UUID PRIMARY KEY,
    review_status TEXT NOT NULL DEFAULT 'open',
    sar_required BOOLEAN NOT NULL DEFAULT FALSE,
    sar_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    sar_submitted_at TIMESTAMPTZ NULL,
    sar_reference TEXT NULL,
    bank_escalation_required BOOLEAN NOT NULL DEFAULT FALSE,
    bank_escalated_at TIMESTAMPTZ NULL,
    assigned_analyst_user_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT aml_case_reviews_status_chk CHECK (
        review_status IN (
            'open',
            'in_review',
            'awaiting_sar_decision',
            'sar_required',
            'sar_prepared',
            'sar_submitted',
            'bank_escalation_required',
            'escalated_to_bank',
            'closed'
        )
    )
);

CREATE TABLE IF NOT EXISTS aml_analyst_actions (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    action_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    performed_by UUID NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT aml_analyst_actions_type_chk CHECK (
        action_type IN (
            'note_added',
            'evidence_attached',
            'review_started',
            'sar_marked_required',
            'sar_marked_not_required',
            'sar_prepared',
            'sar_submitted',
            'bank_escalation_requested',
            'bank_escalation_packaged',
            'bank_reference_recorded',
            'case_closed'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_aml_analyst_actions_case_id
    ON aml_analyst_actions(case_id);

CREATE INDEX IF NOT EXISTS idx_aml_analyst_actions_type
    ON aml_analyst_actions(action_type);

COMMIT;