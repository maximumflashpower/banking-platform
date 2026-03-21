BEGIN;

ALTER TABLE step_up_sessions
  ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE step_up_sessions
  ADD COLUMN IF NOT EXISTS web_session_id uuid NULL,
  ADD COLUMN IF NOT EXISTS device_id_web text NULL,
  ADD COLUMN IF NOT EXISTS device_id_mobile text NULL,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'mobile',
  ADD COLUMN IF NOT EXISTS biometric_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS invalidated_reason text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'step_up_sessions_web_session_id_fkey'
  ) THEN
    ALTER TABLE step_up_sessions
      ADD CONSTRAINT step_up_sessions_web_session_id_fkey
      FOREIGN KEY (web_session_id)
      REFERENCES web_sessions(session_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'step_up_sessions_channel_check'
  ) THEN
    ALTER TABLE step_up_sessions
      ADD CONSTRAINT step_up_sessions_channel_check
      CHECK (channel IN ('mobile', 'web'));
  END IF;
END $$;

DROP INDEX IF EXISTS idx_step_up_sessions_web_session_id;
CREATE INDEX idx_step_up_sessions_web_session_id
  ON step_up_sessions (web_session_id);

DROP INDEX IF EXISTS idx_step_up_sessions_business_state;
CREATE INDEX idx_step_up_sessions_business_state
  ON step_up_sessions (business_id, state, created_at DESC);

DROP INDEX IF EXISTS idx_step_up_sessions_target_id;
CREATE INDEX idx_step_up_sessions_target_id
  ON step_up_sessions (target_type, target_id, created_at DESC);

DROP INDEX IF EXISTS idx_step_up_sessions_user_state_stage7c;
CREATE INDEX idx_step_up_sessions_user_state_stage7c
  ON step_up_sessions (user_id, state, expires_at DESC);

DROP INDEX IF EXISTS uq_step_up_sessions_active_target;
CREATE UNIQUE INDEX uq_step_up_sessions_active_target
  ON step_up_sessions (
    COALESCE(web_session_id::text, session_id),
    purpose,
    target_type,
    target_id
  )
  WHERE state IN ('created', 'pending_verification');

COMMIT;