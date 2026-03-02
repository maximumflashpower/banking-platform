create table if not exists conversations (
  id text primary key,
  created_at timestamptz not null default now(),
  members jsonb not null default '[]'::jsonb
);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  sender_id text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_created
  on messages(conversation_id, created_at);
