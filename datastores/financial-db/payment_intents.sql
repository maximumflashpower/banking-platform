-- Crea la tabla payment_intents
CREATE TABLE IF NOT EXISTS public.payment_intents (
    id UUID PRIMARY KEY, -- Usamos UUID como clave primaria para asegurar un identificador único
    space_id UUID NOT NULL, -- ID del espacio al que pertenece el Payment Intent
    payer_user_id UUID NOT NULL, -- ID del usuario que paga
    payee_user_id UUID NOT NULL, -- ID del usuario receptor
    currency VARCHAR(3) NOT NULL, -- Moneda de la transacción (ejemplo: USD, EUR)
    amount_cents INT NOT NULL, -- Monto en centavos (para evitar errores con decimales)
    idempotency_key VARCHAR(255) NOT NULL, -- Clave de idempotencia para prevenir operaciones duplicadas
    correlation_id VARCHAR(255) NOT NULL, -- ID de correlación para rastrear la transacción
    current_state VARCHAR(50) DEFAULT 'created', -- Estado actual del Payment Intent (creado, validado, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Fecha y hora en que se crea el Payment Intent
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Fecha y hora de la última actualización
    UNIQUE (space_id, idempotency_key) -- Asegura que no existan Payment Intents duplicados para un mismo space_id y idempotency_key
);

-- Agrega índices para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_payment_intents_space_id ON public.payment_intents(space_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_idempotency_key ON public.payment_intents(idempotency_key);

-- Crea la tabla payment_intent_states
CREATE TABLE IF NOT EXISTS public.payment_intent_states (
    id UUID PRIMARY KEY, -- ID único para el estado del Payment Intent
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE, -- Relaciona el estado con un Payment Intent específico
    state VARCHAR(50) NOT NULL, -- Estado del Payment Intent (created, validated, queued, settled, canceled, etc.)
    correlation_id VARCHAR(255) NOT NULL, -- Correlaciona el estado con la transacción original
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Fecha y hora en que se creó el estado
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Fecha y hora de la última actualización
);

-- Agrega índices para mejorar las consultas en los estados
CREATE INDEX IF NOT EXISTS idx_payment_intent_states_payment_intent_id ON public.payment_intent_states(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_intent_states_state ON public.payment_intent_states(state);