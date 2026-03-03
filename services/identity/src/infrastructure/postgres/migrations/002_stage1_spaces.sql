-- 002_stage1_spaces.sql
-- ETAPA 1: personal spaces + session scope

-- 1) Tabla spaces (1 personal por usuario)
create table if not exists spaces (
  id text primary key,
  owner_user_id text not null references users(id) on delete cascade,
  type text not null default 'personal',
  created_at timestamptz not null default now(),
  unique(owner_user_id, type)
);

-- 2) Agregar space_id a sessions (si no existe)
alter table sessions
  add column if not exists space_id text;

-- 3) Backfill: asignar space personal existente (si hay)
update sessions s
set space_id = sp.id
from spaces sp
where s.space_id is null
  and sp.owner_user_id = s.user_id
  and sp.type = 'personal';

-- 4) Índice para aislamiento por espacio
create index if not exists idx_sessions_space_id
  on sessions(space_id);