-- Stage 8B — immutable audit trail and operational evidence
-- Incremental, append-only, reversible.
-- No runtime/dependency changes required.

CREATE TABLE IF NOT EXISTS audit_log_immutable (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id text NOT NULL,
  correlation_id text,
  actor_user_id text,
  actor_session_id text,
  actor_space_id text,
  actor_membership_id text,
  event_category text NOT NULL,
  event_type text NOT NULL,
  target_type text,
  target_id text,
  action text NOT NULL,
  result text NOT NULL,
  risk_level text,
  reason text,
  ip_address text,
  user_agent text,
  route_method text,
  route_path text,
  http_status integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  entry_hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_immutable_occurred_at
  ON audit_log_immutable (occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_immutable_category
  ON audit_log_immutable (event_category, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_immutable_actor_user
  ON audit_log_immutable (actor_user_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_immutable_target
  ON audit_log_immutable (target_type, target_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_immutable_request
  ON audit_log_immutable (request_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_immutable_correlation
  ON audit_log_immutable (correlation_id);

CREATE OR REPLACE FUNCTION forbid_audit_log_immutable_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_immutable is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable_no_update ON audit_log_immutable;
CREATE TRIGGER trg_audit_log_immutable_no_update
BEFORE UPDATE ON audit_log_immutable
FOR EACH ROW
EXECUTE FUNCTION forbid_audit_log_immutable_mutation();

DROP TRIGGER IF EXISTS trg_audit_log_immutable_no_delete ON audit_log_immutable;
CREATE TRIGGER trg_audit_log_immutable_no_delete
BEFORE DELETE ON audit_log_immutable
FOR EACH ROW
EXECUTE FUNCTION forbid_audit_log_immutable_mutation();
