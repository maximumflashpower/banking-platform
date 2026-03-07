CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    run_date DATE NOT NULL,
    source_reference TEXT,

    status TEXT NOT NULL DEFAULT 'running',

    started_at TIMESTAMP NOT NULL DEFAULT now(),
    completed_at TIMESTAMP,

    summary_json JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_run_date
ON reconciliation_runs(run_date);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status
ON reconciliation_runs(status);

CREATE OR REPLACE FUNCTION reconciliation_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliation_runs_updated_at
ON reconciliation_runs;

CREATE TRIGGER trg_reconciliation_runs_updated_at
BEFORE UPDATE ON reconciliation_runs
FOR EACH ROW
EXECUTE FUNCTION reconciliation_runs_updated_at();