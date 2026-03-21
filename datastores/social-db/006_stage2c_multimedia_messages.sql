BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_size_bytes INTEGER;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_metadata JSONB;

ALTER TABLE messages
  ALTER COLUMN body_text DROP NOT NULL;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_type_chk;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_body_not_blank_chk;

ALTER TABLE messages
  ADD CONSTRAINT messages_type_chk
  CHECK (message_type IN ('text', 'image', 'file', 'audio'));

ALTER TABLE messages
  ADD CONSTRAINT messages_body_not_blank_chk
  CHECK (
    message_type <> 'text'
    OR length(btrim(body_text)) > 0
  );

COMMIT;