BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sanctions_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('kyc_individual', 'kyb_business', 'beneficial_owner')),
  subject_id uuid NOT NULL,
  screening_scope text NOT NULL CHECK (screening_scope IN ('kyc', 'kyb', 'beneficial_owner')),
  screening_status text NOT NULL CHECK (screening_status IN ('clear', 'potential_match', 'confirmed_match')),
  screening_provider text NOT NULL DEFAULT 'internal_sanctions_foundation',
  provider_reference text,
  subject_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_code text NOT NULL,
  confidence_score integer NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  case_id uuid,
  screening_version text NOT NULL DEFAULT 'stage6c-foundation-v1',
  created_by text NOT NULL DEFAULT 'system',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sanctions_screenings_subject
  ON sanctions_screenings (subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sanctions_screenings_status
  ON sanctions_screenings (screening_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sanctions_screenings_case_id
  ON sanctions_screenings (case_id);

COMMIT;