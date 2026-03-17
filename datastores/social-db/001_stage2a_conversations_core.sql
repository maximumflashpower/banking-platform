BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id TEXT NOT NULL,
    conversation_type TEXT NOT NULL,
    direct_key TEXT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT conversations_type_chk
        CHECK (conversation_type IN ('direct', 'group')),

    CONSTRAINT conversations_direct_key_required_chk
        CHECK (
            (conversation_type = 'direct' AND direct_key IS NOT NULL)
            OR
            (conversation_type = 'group')
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_space_direct_key_uidx
    ON conversations (space_id, direct_key)
    WHERE direct_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_space_id_idx
    ON conversations (space_id);

CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
    ON conversations (updated_at DESC);

CREATE OR REPLACE FUNCTION set_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversations_set_updated_at ON conversations;

CREATE TRIGGER trg_conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_conversations_updated_at();

COMMIT;