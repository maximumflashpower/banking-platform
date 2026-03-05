BEGIN;

-- UUID generator
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- businesses
-- =========================
CREATE TABLE IF NOT EXISTS businesses (
  business_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_status_chk'
  ) THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_status_chk
      CHECK (status IN ('draft','pending_kyb','verified','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS businesses_status_idx ON businesses(status);
CREATE INDEX IF NOT EXISTS businesses_created_at_idx ON businesses(created_at);

-- =========================
-- business_kyb_submissions
-- =========================
CREATE TABLE IF NOT EXISTS business_kyb_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
  provider_ref TEXT,
  submitted_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'draft',
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_kyb_status_chk'
  ) THEN
    ALTER TABLE business_kyb_submissions
      ADD CONSTRAINT business_kyb_status_chk
      CHECK (status IN ('draft','started','submitted','verified','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS business_kyb_business_idx ON business_kyb_submissions(business_id);
CREATE INDEX IF NOT EXISTS business_kyb_status_idx ON business_kyb_submissions(status);
CREATE INDEX IF NOT EXISTS business_kyb_submitted_at_idx ON business_kyb_submissions(submitted_at);

-- one active kyb per business (non-final)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'business_kyb_one_active_per_business'
  ) THEN
    CREATE UNIQUE INDEX business_kyb_one_active_per_business
      ON business_kyb_submissions(business_id)
      WHERE status IN ('draft','started','submitted');
  END IF;
END $$;

-- =========================
-- business_owners
-- =========================
CREATE TABLE IF NOT EXISTS business_owners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  owner_type  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_owners_owner_type_chk') THEN
    ALTER TABLE business_owners
      ADD CONSTRAINT business_owners_owner_type_chk
      CHECK (owner_type IN ('primary','co_owner'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_owners_status_chk') THEN
    ALTER TABLE business_owners
      ADD CONSTRAINT business_owners_status_chk
      CHECK (status IN ('active','revoked'));
  END IF;
END $$;

-- One primary owner per business (active)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='i' AND c.relname='business_owners_one_primary'
  ) THEN
    CREATE UNIQUE INDEX business_owners_one_primary
      ON business_owners(business_id)
      WHERE owner_type='primary' AND status='active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='i' AND c.relname='business_owners_unique_active_user'
  ) THEN
    CREATE UNIQUE INDEX business_owners_unique_active_user
      ON business_owners(business_id, user_id)
      WHERE status='active';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS business_owners_business_idx ON business_owners(business_id);
CREATE INDEX IF NOT EXISTS business_owners_user_idx ON business_owners(user_id);

-- =========================
-- business_members
-- =========================
CREATE TABLE IF NOT EXISTS business_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'invited',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='business_members_status_chk'
  ) THEN
    ALTER TABLE business_members
      ADD CONSTRAINT business_members_status_chk
      CHECK (status IN ('active','invited','revoked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS business_members_business_idx ON business_members(business_id);
CREATE INDEX IF NOT EXISTS business_members_user_idx ON business_members(user_id);
CREATE INDEX IF NOT EXISTS business_members_status_idx ON business_members(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.relkind='i' AND c.relname='business_members_unique_live_user'
  ) THEN
    CREATE UNIQUE INDEX business_members_unique_live_user
      ON business_members(business_id, user_id)
      WHERE status IN ('active','invited');
  END IF;
END $$;

-- =========================
-- business_roles
-- =========================
CREATE TABLE IF NOT EXISTS business_roles (
  role        TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

-- =========================
-- business_role_bindings
-- =========================
CREATE TABLE IF NOT EXISTS business_role_bindings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(business_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL REFERENCES business_roles(role) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_role_bindings_unique
  ON business_role_bindings(business_id, user_id, role);

CREATE INDEX IF NOT EXISTS business_role_bindings_business_idx ON business_role_bindings(business_id);
CREATE INDEX IF NOT EXISTS business_role_bindings_user_idx ON business_role_bindings(user_id);

-- =========================
-- audit_events
-- =========================
CREATE TABLE IF NOT EXISTS audit_events (
  event_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT,
  event_type    TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at);

COMMIT;