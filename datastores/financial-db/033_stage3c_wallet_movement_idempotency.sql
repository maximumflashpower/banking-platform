BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_reference_unique
ON ledger_entries(reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

COMMIT;
