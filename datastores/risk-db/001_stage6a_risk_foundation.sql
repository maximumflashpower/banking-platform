BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.risk_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type TEXT NOT NULL,
    subject_id UUID NOT NULL,
    space_id UUID NULL,
    risk_tier TEXT NOT NULL DEFAULT 'standard',
    profile_status TEXT NOT NULL DEFAULT 'active',
    profile_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_profiles_subject_type_chk
      CHECK (subject_type IN ('user','business','payment_intent','card','space')),
    CONSTRAINT risk_profiles_risk_tier_chk
      CHECK (risk_tier IN ('low','standard','elevated','high')),
    CONSTRAINT risk_profiles_profile_status_chk
      CHECK (profile_status IN ('active','inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_risk_profiles_subject
    ON public.risk_profiles(subject_type, subject_id);

CREATE INDEX IF NOT EXISTS ix_risk_profiles_space_id
    ON public.risk_profiles(space_id);

CREATE TABLE IF NOT EXISTS public.risk_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id UUID NOT NULL,
    space_id UUID NULL,
    source_system TEXT NOT NULL,
    severity TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    observed_at TIMESTAMPTZ NOT NULL,
    ingest_idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_signals_subject_type_chk
      CHECK (subject_type IN ('user','business','payment_intent','card','space')),
    CONSTRAINT risk_signals_severity_chk
      CHECK (severity IN ('low','medium','high','critical')),
    CONSTRAINT risk_signals_payload_object_chk
      CHECK (jsonb_typeof(payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_risk_signals_ingest_idempotency_key
    ON public.risk_signals(ingest_idempotency_key);

CREATE INDEX IF NOT EXISTS ix_risk_signals_subject
    ON public.risk_signals(subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_risk_signals_space_id
    ON public.risk_signals(space_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_risk_signals_signal_type
    ON public.risk_signals(signal_type);

CREATE TABLE IF NOT EXISTS public.risk_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type TEXT NOT NULL,
    subject_id UUID NOT NULL,
    space_id UUID NULL,
    decision_outcome TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    risk_score INTEGER NULL,
    signal_count INTEGER NOT NULL DEFAULT 0,
    evaluation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    decided_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_decisions_subject_type_chk
      CHECK (subject_type IN ('user','business','payment_intent','card','space')),
    CONSTRAINT risk_decisions_decision_outcome_chk
      CHECK (decision_outcome IN ('allow','observe','review','decline_recommendation')),
    CONSTRAINT risk_decisions_reason_code_not_blank_chk
      CHECK (length(btrim(reason_code)) > 0),
    CONSTRAINT risk_decisions_evaluation_context_object_chk
      CHECK (jsonb_typeof(evaluation_context) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_risk_decisions_subject
    ON public.risk_decisions(subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_risk_decisions_space_id
    ON public.risk_decisions(space_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_risk_decisions_reason_code
    ON public.risk_decisions(reason_code);

CREATE TABLE IF NOT EXISTS public.risk_decision_signal_links (
    decision_id UUID NOT NULL REFERENCES public.risk_decisions(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES public.risk_signals(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (decision_id, signal_id)
);

CREATE INDEX IF NOT EXISTS ix_risk_decision_signal_links_signal_id
    ON public.risk_decision_signal_links(signal_id);

CREATE TABLE IF NOT EXISTS public.risk_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES public.risk_decisions(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    action_status TEXT NOT NULL DEFAULT 'recommended',
    action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_actions_action_type_chk
      CHECK (action_type IN ('manual_review','enhanced_monitoring','collect_more_signals','decline_recommendation')),
    CONSTRAINT risk_actions_action_status_chk
      CHECK (action_status IN ('recommended')),
    CONSTRAINT risk_actions_action_payload_object_chk
      CHECK (jsonb_typeof(action_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_risk_actions_decision_id
    ON public.risk_actions(decision_id);

CREATE TABLE IF NOT EXISTS public.risk_audit_immutable (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_audit_payload_object_chk
      CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_risk_audit_entity
    ON public.risk_audit_immutable(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_risk_audit_event_type
    ON public.risk_audit_immutable(event_type, created_at DESC);

COMMENT ON TABLE public.risk_profiles IS
'Stage 6A risk foundation: profile spine for risk subjects. No enforcement hooks.';
COMMENT ON TABLE public.risk_signals IS
'Stage 6A risk foundation: immutable signal intake, idempotent by ingest_idempotency_key.';
COMMENT ON TABLE public.risk_decisions IS
'Stage 6A risk foundation: auditable decisions with mandatory reason_code and no hard enforcement.';
COMMENT ON TABLE public.risk_actions IS
'Stage 6A risk foundation: recommended-only actions. No executor in this stage.';
COMMENT ON TABLE public.risk_audit_immutable IS
'Stage 6A risk foundation: immutable audit spine for all risk decisions and signal ingest actions.';

COMMIT;
