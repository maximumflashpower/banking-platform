BEGIN;

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id UUID NOT NULL,
    space_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    member_role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT conversation_members_pk
        PRIMARY KEY (conversation_id, user_id),

    CONSTRAINT conversation_members_conversation_fk
        FOREIGN KEY (conversation_id)
        REFERENCES conversations (id)
        ON DELETE CASCADE,

    CONSTRAINT conversation_members_role_chk
        CHECK (member_role IN ('owner', 'admin', 'member'))
);

CREATE INDEX IF NOT EXISTS conversation_members_space_user_idx
    ON conversation_members (space_id, user_id);

CREATE INDEX IF NOT EXISTS conversation_members_conversation_idx
    ON conversation_members (conversation_id);

CREATE INDEX IF NOT EXISTS conversation_members_space_conversation_idx
    ON conversation_members (space_id, conversation_id);

COMMIT;