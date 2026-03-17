BEGIN;

ALTER TABLE conversations
  ALTER COLUMN created_by_user_id TYPE TEXT
  USING created_by_user_id::text;

COMMIT;