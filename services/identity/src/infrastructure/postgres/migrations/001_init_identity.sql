create table if not exists users (
  id text primary key,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists user_devices (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  unique(user_id, device_id)
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

create index if not exists idx_sessions_user_active
  on sessions(user_id)
  where revoked_at is null;