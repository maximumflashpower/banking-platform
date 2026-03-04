BEGIN;

-- Crea la tabla payment_intent_states
CREATE TABLE IF NOT EXISTS public.payment_intent_states (
    id UUID PRIMARY KEY, -- ID único para el estado del Payment Intent
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE, -- Relacionado con un Payment Intent específico
    state TEXT NOT NULL CHECK (
        state IN ('created', 'validated', 'queued', 'settled', 'rejected', 'failed', 'canceled')
    ), -- Los estados válidos para el Payment Intent
    reason_code TEXT NULL, -- Código de razón, opcional, puede ser útil para el rechazo o error
    reason_detail TEXT NULL, -- Detalles adicionales sobre el motivo, si aplica
    correlation_id TEXT NOT NULL, -- Correlaciona este estado con la transacción original
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- Fecha y hora de creación del estado
    updated_at TIMESTAMPTZ DEFAULT now() -- Fecha y hora de última actualización (opcional)
);

-- Crea un índice para acelerar las consultas por payment_intent_id y created_at
CREATE INDEX IF NOT EXISTS ix_payment_intent_states_intent
    ON public.payment_intent_states(payment_intent_id, state, created_at ASC);

COMMIT;