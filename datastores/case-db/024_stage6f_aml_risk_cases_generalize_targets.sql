BEGIN;

ALTER TABLE aml_risk_cases
  ALTER COLUMN payment_intent_id DROP NOT NULL;

ALTER TABLE aml_risk_cases
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE aml_risk_cases
   SET metadata = '{}'::jsonb
 WHERE metadata IS NULL;

ALTER TABLE aml_risk_cases
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_aml_risk_cases_open_target
  ON aml_risk_cases ((metadata->>'target_type'), (metadata->>'target_id'))
  WHERE status IN ('open', 'in_review', 'awaiting_sar_decision', 'sar_required', 'sar_prepared');

COMMIT;
