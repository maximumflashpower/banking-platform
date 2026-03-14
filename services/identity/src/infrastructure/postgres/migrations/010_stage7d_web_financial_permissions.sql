BEGIN;

ALTER TABLE step_up_events
  DROP CONSTRAINT IF EXISTS step_up_events_event_type_check;

ALTER TABLE step_up_events
  ADD CONSTRAINT step_up_events_event_type_check
  CHECK (
    event_type IN (
      'step_up_created',
      'verification_requested',
      'verification_succeeded',
      'verification_failed',
      'step_up_verified',
      'step_up_expired',
      'step_up_cancelled',
      'step_up_consumed'
    )
  );

CREATE INDEX IF NOT EXISTS idx_step_up_sessions_web_action_verified
ON step_up_sessions (web_session_id, target_type, target_id, confirmed_at DESC)
WHERE state = 'verified'
  AND consumed_at IS NULL
  AND invalidated_at IS NULL;

COMMIT;
