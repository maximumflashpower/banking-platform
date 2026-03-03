-- 003_add_space_id.sql
-- ETAPA 1: aislamiento por space_id (personal)

-- 1) conversations: add space_id
alter table conversations
  add column if not exists space_id text;

-- 2) messages: add space_id
alter table messages
  add column if not exists space_id text;

-- 3) Backfill (DEV-safe):
-- Si ya hay data vieja, la dejamos con space_id NULL.
-- En ETAPA 1, el código nuevo siempre insertará space_id.
-- (Opcional: podrías asignar un "legacy_space" fijo, pero mejor no inventar.)
create index if not exists idx_conversations_space_created
  on conversations(space_id, created_at desc);

create index if not exists idx_messages_space_conversation_created
  on messages(space_id, conversation_id, created_at desc, id desc);