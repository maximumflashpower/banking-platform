-- ============================================
-- Stage 2 Identity Core Initialization
-- ============================================

-- conectar a la base identity creada por 001-create-identity-db.sql
\connect identity;

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- USERS
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_norm_uq
ON users (email_norm);

-- ============================================
-- SPACES
-- ============================================

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spaces_owner_user_id_idx
ON spaces (owner_user_id);

-- ============================================
-- SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx
ON sessions (user_id);

CREATE INDEX IF NOT EXISTS sessions_space_id_idx
ON sessions (space_id);

-- ============================================
-- DEMO USER (Stage 2)
-- ============================================

INSERT INTO users (id, email, email_norm, password_hash)
VALUES (
  'user-test-1',
  'owner@test.com',
  'owner@test.com',
  crypt('pass1234', gen_salt('bf'))
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    email_norm = EXCLUDED.email_norm,
    password_hash = EXCLUDED.password_hash;