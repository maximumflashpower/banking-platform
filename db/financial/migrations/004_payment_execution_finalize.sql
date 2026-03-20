BEGIN;

ALTER TABLE payment_intents_core
  DROP CONSTRAINT IF EXISTS payment_intents_core_status_check;

ALTER TABLE payment_intents_core
  ADD CONSTRAINT payment_intents_core_status_check
  CHECK (status IN ('created', 'confirmed', 'canceled', 'executed'));

ALTER TABLE payment_intent_executions
  DROP CONSTRAINT IF EXISTS payment_intent_executions_execution_status_check;

ALTER TABLE payment_intent_executions
  ADD CONSTRAINT payment_intent_executions_execution_status_check
  CHECK (execution_status IN ('recorded', 'executed', 'failed'));

COMMIT;