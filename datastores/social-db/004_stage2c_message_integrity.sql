BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_conversation_client_message_id_uniq'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_conversation_client_message_id_uniq
      UNIQUE (conversation_id, client_message_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at_id
  ON messages (conversation_id, created_at ASC, id ASC);

ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NULL;

COMMIT;