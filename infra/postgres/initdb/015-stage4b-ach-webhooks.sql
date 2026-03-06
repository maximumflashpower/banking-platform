\c financial_db;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rails_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT NULL,
    signature_valid BOOLEAN NULL,
    processing_status TEXT NOT NULL DEFAULT 'stored',
    error_message TEXT NULL,
    payment_intent_id UUID NULL,
    transfer_id UUID NULL,
    settlement_applied BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rails_webhook_events_provider_event_unique
        UNIQUE (provider, provider_event_id),

    CONSTRAINT rails_webhook_events_processing_status_check
        CHECK (
            processing_status IN (
                'stored',
                'processed',
                'duplicate',
                'ignored_unknown_status',
                'ignored_unresolved_transfer',
                'ignored_terminal_state',
                'error'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_rails_webhook_events_provider_received_at
    ON rails_webhook_events (provider, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_rails_webhook_events_processing_status
    ON rails_webhook_events (processing_status);

CREATE INDEX IF NOT EXISTS idx_rails_webhook_events_payment_intent_id
    ON rails_webhook_events (payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_rails_webhook_events_transfer_id
    ON rails_webhook_events (transfer_id);

CREATE INDEX IF NOT EXISTS idx_rails_webhook_events_payload_gin
    ON rails_webhook_events USING GIN (payload);

CREATE OR REPLACE FUNCTION set_rails_webhook_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rails_webhook_events_updated_at ON rails_webhook_events;

CREATE TRIGGER trg_rails_webhook_events_updated_at
BEFORE UPDATE ON rails_webhook_events
FOR EACH ROW
EXECUTE FUNCTION set_rails_webhook_events_updated_at();

COMMIT;