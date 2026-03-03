-- 003_stage1_auth.sql
-- ETAPA 1: Auth + sesiones + space scope (sin dependencias externas)

-- 1) USERS: credenciales + normalización de email
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_norm text;

-- Backfill email_norm si ya hay filas
UPDATE users
SET email_norm = lower(trim(email))
WHERE email_norm IS NULL;

-- Unicidad por email_norm (índice, no constraint, para no pelear con nombres)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_norm_uq
  ON users(email_norm);

-- Campos para hashing (se llenan desde el código usando crypto.scrypt)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_salt text;

-- updated_at (útil para ETAPA 1)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Consistencia: o ambos password_* están, o ninguno (evita estados rotos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_password_fields_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_password_fields_chk
      CHECK (
        (password_hash IS NULL AND password_salt IS NULL)
        OR
        (password_hash IS NOT NULL AND password_salt IS NOT NULL)
      );
  END IF;
END$$;

-- 2) SESSIONS: agregar scope por space
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS space_id text;

-- Intento de backfill: asigna el personal space del user si existe (no falla si no existe)
UPDATE sessions s
SET space_id = sp.id
FROM spaces sp
WHERE s.space_id IS NULL
  AND sp.owner_user_id = s.user_id
  AND sp.type = 'personal';

-- Índice para filtrado por espacio (social isolation)
CREATE INDEX IF NOT EXISTS idx_sessions_space_id
  ON sessions(space_id);

-- Consistencia: una sesión válida debería tener space_id (no lo forzamos NOT NULL para no romper datos viejos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_space_required_if_active_chk'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_space_required_if_active_chk
      CHECK (
        revoked_at IS NOT NULL
        OR expires_at <= now()
        OR space_id IS NOT NULL
      );
  END IF;
END$$;