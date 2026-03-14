ALTER TABLE payment_intent_states
DROP CONSTRAINT IF EXISTS payment_intent_states_state_check;

ALTER TABLE payment_intent_states
ADD CONSTRAINT payment_intent_states_state_check
CHECK (
  state = ANY (
    ARRAY[
      'created'::text,
      'validated'::text,
      'pending_approval'::text,
      'approved'::text,
      'queued'::text,
      'submitted'::text,
      'processing'::text,
      'settled'::text,
      'failed'::text,
      'rejected'::text,
      'canceled'::text
    ]
  )
);