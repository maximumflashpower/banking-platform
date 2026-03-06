CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reconciliation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    reconciliation_run_id UUID NOT NULL
        REFERENCES reconciliation_runs(id) ON DELETE CASCADE,

    external_reference TEXT,
    ledger_reference TEXT,
    provider_reference TEXT,

    bank_amount NUMERIC,
    ledger_amount NUMERIC,
    provider_amount NUMERIC,

    discrepancy_state TEXT NOT NULL,

    details_json JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_items_run
ON reconciliation_items(reconciliation_run_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_items_state
ON reconciliation_items(discrepancy_state);

CREATE INDEX IF NOT EXISTS idx_reconciliation_items_reference
ON reconciliation_items(external_reference);

CREATE OR REPLACE FUNCTION reconciliation_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliation_items_updated_at
ON reconciliation_items;

CREATE TRIGGER trg_reconciliation_items_updated_at
BEFORE UPDATE ON reconciliation_items
FOR EACH ROW
EXECUTE FUNCTION reconciliation_items_updated_at();