CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_token text NOT NULL UNIQUE,
  business_id text NULL,
  user_id text NULL,
  space_uuid uuid NULL,
  program_id text NULL,
  brand text NULL,
  network text NULL,
  last4 text NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  exp_month int NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year int NULL CHECK (exp_year >= 2000),
  cardholder_name text NULL,
  status text NOT NULL CHECK (status IN ('active', 'frozen', 'closed')),
  freeze_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_created_at
  ON cards (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cards_business_id
  ON cards (business_id);

CREATE INDEX IF NOT EXISTS idx_cards_user_id
  ON cards (user_id);

CREATE INDEX IF NOT EXISTS idx_cards_space_uuid
  ON cards (space_uuid);

CREATE INDEX IF NOT EXISTS idx_cards_status
  ON cards (status);