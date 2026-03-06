CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS financial_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ NULL,
    last_error TEXT NULL,
    correlation_id TEXT NULL,
    idempotency_key TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE financial_outbox
    ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS last_error TEXT NULL,
    ADD COLUMN IF NOT EXISTS correlation_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'financial_outbox_status_check'
    ) THEN
        ALTER TABLE financial_outbox
        ADD CONSTRAINT financial_outbox_status_check
        CHECK (status IN ('pending', 'processing', 'published', 'failed'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_outbox_status_available
    ON financial_outbox (status, available_at);

CREATE INDEX IF NOT EXISTS idx_financial_outbox_aggregate
    ON financial_outbox (aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_outbox_event_type
    ON financial_outbox (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_outbox_correlation_id
    ON financial_outbox (correlation_id);

CREATE OR REPLACE FUNCTION set_financial_outbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_financial_outbox_updated_at ON financial_outbox;

CREATE TRIGGER trg_financial_outbox_updated_at
BEFORE UPDATE ON financial_outbox
FOR EACH ROW
EXECUTE FUNCTION set_financial_outbox_updated_at();