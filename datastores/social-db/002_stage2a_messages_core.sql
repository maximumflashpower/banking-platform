BEGIN;

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    space_id TEXT NOT NULL,
    sender_user_id TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    body_text TEXT NOT NULL,
    client_message_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT messages_conversation_fk
        FOREIGN KEY (conversation_id)
        REFERENCES conversations (id)
        ON DELETE CASCADE,

    CONSTRAINT messages_type_chk
        CHECK (message_type IN ('text', 'attachment', 'mixed')),

    CONSTRAINT messages_body_not_blank_chk
        CHECK (length(btrim(body_text)) > 0)
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
    ON messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS messages_space_id_idx
    ON messages (space_id);

CREATE INDEX IF NOT EXISTS messages_sender_user_id_idx
    ON messages (sender_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS messages_client_idempotency_uidx
    ON messages (conversation_id, sender_user_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

COMMIT;