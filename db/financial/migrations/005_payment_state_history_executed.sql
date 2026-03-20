BEGIN;

ALTER TABLE payment_intent_state_history
  DROP CONSTRAINT IF EXISTS payment_intent_state_history_state_check;

ALTER TABLE payment_intent_state_history
  ADD CONSTRAINT payment_intent_state_history_state_check
  CHECK (state IN ('created', 'confirmed', 'canceled', 'executed'));

COMMIT;