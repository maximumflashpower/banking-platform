create index if not exists idx_messages_conversation_created_id
  on messages(conversation_id, created_at desc, id desc);
