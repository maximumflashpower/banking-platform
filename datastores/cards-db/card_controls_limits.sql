CREATE TABLE IF NOT EXISTS card_controls_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  atm_enabled boolean NOT NULL DEFAULT true,
  ecommerce_enabled boolean NOT NULL DEFAULT true,
  international_enabled boolean NOT NULL DEFAULT true,
  contactless_enabled boolean NOT NULL DEFAULT true,
  daily_spend_limit numeric(18,2) NULL,
  monthly_spend_limit numeric(18,2) NULL,
  single_tx_limit numeric(18,2) NULL,
  currency text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id)
);