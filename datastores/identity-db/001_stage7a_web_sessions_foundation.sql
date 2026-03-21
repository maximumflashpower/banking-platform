+create extension if not exists pgcrypto;
+
+create table if not exists web_sessions (
+  session_id uuid primary key default gen_random_uuid(),
+  session_request_id uuid not null,
+  user_id uuid not null,
+  device_id_web text not null,
+  active_space_id uuid null,
+  status text not null check (status in ('pending', 'active', 'expired', 'revoked')),
+  created_at timestamptz not null default now(),
+  confirmed_at timestamptz null,
+  expires_at timestamptz not null,
+  last_seen_at timestamptz null
+);
+
+create unique index if not exists uq_web_sessions_request_id
+  on web_sessions (session_request_id);
+
+create index if not exists idx_web_sessions_user_status
+  on web_sessions (user_id, status, expires_at desc);
+
+create index if not exists idx_web_sessions_device_status
+  on web_sessions (device_id_web, status, expires_at desc);
+
+create table if not exists web_session_events (
+  id uuid primary key default gen_random_uuid(),
+  web_session_id uuid not null references web_sessions(session_id) on delete cascade,
+  event_type text not null,
+  payload_json jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default now()
+);