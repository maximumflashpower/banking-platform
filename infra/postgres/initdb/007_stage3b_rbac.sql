-- Entitlements por rol (o por miembro si quieres granularidad)
CREATE TABLE IF NOT EXISTS entitlements (
  id bigserial PRIMARY KEY,
  business_id uuid NOT NULL,
  role text NOT NULL, -- owner/admin/member
  entitlement text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, role, entitlement)
);

-- Auditoría de cambios de rol / gobernanza
CREATE TABLE IF NOT EXISTS role_change_events (
  id bigserial PRIMARY KEY,
  business_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  from_role text,
  to_role text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_business_role ON entitlements(business_id, role);
CREATE INDEX IF NOT EXISTS idx_role_change_events_business ON role_change_events(business_id, created_at DESC);