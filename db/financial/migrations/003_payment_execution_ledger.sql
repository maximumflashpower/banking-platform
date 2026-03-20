ALTER TABLE payment_intent_executions
    ADD COLUMN IF NOT EXISTS ledger_transaction_id TEXT,
    ADD COLUMN IF NOT EXISTS ledger_error_code TEXT,
    ADD COLUMN IF NOT EXISTS ledger_error_message TEXT,
    ADD COLUMN IF NOT EXISTS ledger_executed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intent_executions_payment_intent_id
    ON payment_intent_executions (payment_intent_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intent_executions_ledger_transaction_id
    ON payment_intent_executions (ledger_transaction_id)
    WHERE ledger_transaction_id IS NOT NULL;