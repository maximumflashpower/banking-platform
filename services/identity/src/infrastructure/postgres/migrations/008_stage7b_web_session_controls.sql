alter table web_sessions
  add column if not exists invalidated_reason text null;

alter table web_sessions
  add column if not exists invalidated_at timestamptz null;

alter table web_sessions
  add column if not exists last_activity_at timestamptz null;

create index if not exists idx_web_sessions_status_last_activity
  on web_sessions(status, last_activity_at);

create index if not exists idx_web_sessions_invalidated_at
  on web_sessions(invalidated_at);