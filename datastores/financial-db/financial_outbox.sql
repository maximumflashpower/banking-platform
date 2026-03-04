-- Asegurarse de que la extensión pgcrypto esté disponible para generar UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Crear la tabla financial_outbox si no existe
CREATE TABLE IF NOT EXISTS financial_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- UUID generado automáticamente
  space_id        uuid NOT NULL,                                 -- El espacio al que pertenece el evento
  event_type      text NOT NULL,                                 -- Tipo de evento, como 'fin.ledger.journal_posted.v1'
  aggregate_type  text NOT NULL,                                 -- Tipo de agregado, como 'ledger_journal_entry'
  aggregate_id    uuid NOT NULL,                                 -- ID del agregado, como 'journal_entry_id'
  payload         jsonb NOT NULL,                                -- Datos del evento en formato JSON
  correlation_id  text NOT NULL,                                 -- ID para correlacionar los eventos
  idempotency_key text NOT NULL,                                 -- Clave de idempotencia para evitar repeticiones
  created_at      timestamptz NOT NULL DEFAULT now()            -- Fecha y hora de creación del evento
);

-- Crear índices para optimizar las búsquedas en la tabla
CREATE INDEX IF NOT EXISTS idx_fin_outbox_created ON financial_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_fin_outbox_space_created ON financial_outbox(space_id, created_at);