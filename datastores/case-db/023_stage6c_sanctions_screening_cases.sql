BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sanctions_screening_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id uuid NOT NULL UNIQUE,
  subject_type text NOT NULL CHECK (subject_type IN ('kyc_individual', 'kyb_business', 'beneficial_owner')),
  subject_id uuid NOT NULL,
  screening_status text NOT NULL CHECK (screening_status IN ('potential_match')),
  queue_name text NOT NULL DEFAULT 'sanctions-screening',
  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL DEFAULT 'medium',
  reason_code text NOT NULL,
  provider_reference text,
  matched_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sanctions_screening_cases_subject
  ON sanctions_screening_cases (subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sanctions_screening_cases_status
  ON sanctions_screening_cases (status, created_at DESC);

COMMIT;