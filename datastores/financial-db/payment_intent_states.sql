BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_intent_states (
    id UUID PRIMARY KEY,
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (
        state IN (
          'created',
          'validated',
          'pending_approval',
          'approved',
          'queued',
          'settled',
          'rejected',
          'failed',
          'canceled'
        )
    ),
    reason_code TEXT NULL,
    reason_detail TEXT NULL,
    correlation_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_payment_intent_states_intent
    ON public.payment_intent_states(payment_intent_id, state, created_at ASC);

COMMIT;