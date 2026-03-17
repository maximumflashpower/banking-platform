BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

ALTER TABLE conversation_members
  DROP CONSTRAINT IF EXISTS conversation_members_member_role_check;

ALTER TABLE conversation_members
  ADD CONSTRAINT conversation_members_member_role_check
  CHECK (member_role IN ('owner', 'admin', 'member'));

CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_role
  ON conversation_members (conversation_id, member_role);

COMMIT;
