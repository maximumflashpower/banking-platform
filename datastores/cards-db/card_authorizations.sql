CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS card_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(id),
    space_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_auth_id TEXT NULL,
    idempotency_key TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount >= 0),
    currency CHAR(3) NOT NULL,
    merchant_name TEXT NULL,
    merchant_mcc TEXT NULL,
    status TEXT NOT NULL DEFAULT 'decisioned'
        CHECK (status IN ('received', 'decisioned')),
    decision TEXT NOT NULL
        CHECK (decision IN ('approve', 'decline')),
    decline_reason TEXT NULL,
    risk_status TEXT NOT NULL DEFAULT 'not_requested'
        CHECK (risk_status IN ('approved', 'declined', 'timeout', 'error', 'not_requested')),
    available_balance_snapshot BIGINT NULL,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    decisioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_card_authorizations_provider_auth
    ON card_authorizations(provider, provider_auth_id)
    WHERE provider_auth_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_card_authorizations_idempotency_key
    ON card_authorizations(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_card_authorizations_card_id_created_at
    ON card_authorizations(card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_authorizations_space_id_created_at
    ON card_authorizations(space_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_authorizations_created_at
    ON card_authorizations(created_at DESC);

CREATE OR REPLACE FUNCTION set_card_authorizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_card_authorizations_updated_at ON card_authorizations;

CREATE TRIGGER trg_card_authorizations_updated_at
BEFORE UPDATE ON card_authorizations
FOR EACH ROW
EXECUTE FUNCTION set_card_authorizations_updated_at();