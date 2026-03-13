create table if not exists web_sessions (
  session_id uuid primary key,
  session_request_id uuid not null unique,

  user_id text references users(id) on delete cascade,
  device_id_web text not null,

  active_space_id text references spaces(id) on delete set null,

  status text not null,

  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz not null,
  last_seen_at timestamptz,

  check (status in ('pending','active','expired','revoked'))
);

create index if not exists idx_web_sessions_user_status
on web_sessions(user_id,status,created_at desc);

create index if not exists idx_web_sessions_device_status
on web_sessions(device_id_web,status,created_at desc);

create index if not exists idx_web_sessions_expires
on web_sessions(expires_at);


create table if not exists web_session_events (
  id uuid primary key,
  web_session_id uuid not null
    references web_sessions(session_id)
    on delete cascade,

  event_type text not null,

  payload_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_web_session_events_session
on web_session_events(web_session_id,created_at desc);