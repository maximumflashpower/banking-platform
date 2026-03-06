\connect financial_db;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- shared trigger helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- payment_intents
-- =========================================================
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL,
  payer_user_id UUID NOT NULL,
  payee_user_id UUID NOT NULL,
  currency CHAR(3) NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_payment_intents_space_created
  ON public.payment_intents(space_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_intents_space_idempotency
  ON public.payment_intents(space_id, idempotency_key);

DROP TRIGGER IF EXISTS trg_payment_intents_set_updated_at ON public.payment_intents;
CREATE TRIGGER trg_payment_intents_set_updated_at
BEFORE UPDATE ON public.payment_intents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- payment_intent_states
-- historial auditable de estados
-- =========================================================
CREATE TABLE IF NOT EXISTS public.payment_intent_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (
    state IN (
      'created',
      'validated',
      'pending_approval',
      'queued',
      'submitted',
      'processing',
      'settled',
      'failed',
      'rejected',
      'canceled'
    )
  ),
  reason_code TEXT NULL,
  reason_detail TEXT NULL,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_payment_intent_states_intent
  ON public.payment_intent_states(payment_intent_id, created_at ASC);

CREATE INDEX IF NOT EXISTS ix_payment_intent_states_intent_state_created
  ON public.payment_intent_states(payment_intent_id, state, created_at ASC);

DROP TRIGGER IF EXISTS trg_payment_intent_states_set_updated_at ON public.payment_intent_states;
CREATE TRIGGER trg_payment_intent_states_set_updated_at
BEFORE UPDATE ON public.payment_intent_states
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- view: current_payment_intents
-- estado actual derivado del historial
-- útil para Stage 4A y consultas del gateway
-- =========================================================
CREATE OR REPLACE VIEW public.current_payment_intents AS
SELECT
  pi.id,
  pi.space_id,
  pi.payer_user_id,
  pi.payee_user_id,
  pi.currency,
  pi.amount_cents,
  pi.idempotency_key,
  pi.correlation_id,
  pi.created_at,
  pi.updated_at,
  pis.state,
  pis.reason_code,
  pis.reason_detail,
  pis.created_at AS state_created_at
FROM public.payment_intents pi
LEFT JOIN LATERAL (
  SELECT
    s.state,
    s.reason_code,
    s.reason_detail,
    s.created_at
  FROM public.payment_intent_states s
  WHERE s.payment_intent_id = pi.id
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 1
) pis ON TRUE;

-- =========================================================
-- Stage 3C — Payment Approvals
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_approval_status') THEN
    CREATE TYPE payment_approval_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_approval_vote') THEN
    CREATE TYPE payment_approval_vote AS ENUM ('approve', 'reject');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.payment_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  business_id uuid NOT NULL,
  payment_intent_id uuid NOT NULL UNIQUE REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  status payment_approval_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  policy_version text NOT NULL DEFAULT 'v1',
  threshold_amount_cents bigint NOT NULL CHECK (threshold_amount_cents >= 0),
  required_approvals int NOT NULL CHECK (required_approvals >= 1),
  eligible_voters_count int NOT NULL CHECK (eligible_voters_count >= 0),
  approvals_count int NOT NULL DEFAULT 0 CHECK (approvals_count >= 0),
  rejections_count int NOT NULL DEFAULT 0 CHECK (rejections_count >= 0),
  rejection_mode text NOT NULL DEFAULT 'majority' CHECK (rejection_mode IN ('any', 'majority')),
  expires_at timestamptz NULL,
  created_by_member_id uuid NULL,
  resolution_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_approvals_status_resolved_at_chk
    CHECK (
      (status = 'pending' AND resolved_at IS NULL)
      OR
      (status IN ('approved', 'rejected', 'cancelled', 'expired') AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_space_status_created
  ON public.payment_approvals(space_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_business_status_created
  ON public.payment_approvals(business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_intent
  ON public.payment_approvals(payment_intent_id);

DROP TRIGGER IF EXISTS trg_payment_approvals_set_updated_at ON public.payment_approvals;
CREATE TRIGGER trg_payment_approvals_set_updated_at
BEFORE UPDATE ON public.payment_approvals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_approval_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.payment_approvals(id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  business_id uuid NOT NULL,
  member_id uuid NOT NULL,
  vote payment_approval_vote NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  comment text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_approval_votes_one_per_member UNIQUE (approval_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_approval_votes_approval
  ON public.payment_approval_votes(approval_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_payment_approval_votes_space_member
  ON public.payment_approval_votes(space_id, member_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.payment_approvals_recompute_and_resolve(p_approval_id uuid)
RETURNS void AS $$
DECLARE
  a_count int;
  r_count int;
  req int;
  elig int;
  rej_mode text;
  current_status payment_approval_status;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN v.vote = 'approve' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN v.vote = 'reject' THEN 1 ELSE 0 END), 0)
  INTO a_count, r_count
  FROM public.payment_approval_votes v
  WHERE v.approval_id = p_approval_id;

  SELECT
    status,
    required_approvals,
    eligible_voters_count,
    rejection_mode
  INTO
    current_status,
    req,
    elig,
    rej_mode
  FROM public.payment_approvals
  WHERE id = p_approval_id
  FOR UPDATE;

  UPDATE public.payment_approvals
  SET
    approvals_count = a_count,
    rejections_count = r_count
  WHERE id = p_approval_id;

  IF current_status <> 'pending' THEN
    RETURN;
  END IF;

  IF a_count >= req THEN
    UPDATE public.payment_approvals
    SET
      status = 'approved',
      resolved_at = now()
    WHERE id = p_approval_id;
    RETURN;
  END IF;

  IF rej_mode = 'any' AND r_count >= 1 THEN
    UPDATE public.payment_approvals
    SET
      status = 'rejected',
      resolved_at = now(),
      resolution_reason = 'rejected_by_any'
    WHERE id = p_approval_id;
    RETURN;
  END IF;

  IF rej_mode = 'majority' AND elig > 0 AND r_count > (elig / 2) THEN
    UPDATE public.payment_approvals
    SET
      status = 'rejected',
      resolved_at = now(),
      resolution_reason = 'rejected_by_majority'
    WHERE id = p_approval_id;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_payment_approval_votes_after_insert()
RETURNS trigger AS $$
BEGIN
  PERFORM public.payment_approvals_recompute_and_resolve(NEW.approval_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_approval_votes_after_insert ON public.payment_approval_votes;
CREATE TRIGGER trg_payment_approval_votes_after_insert
AFTER INSERT ON public.payment_approval_votes
FOR EACH ROW
EXECUTE FUNCTION public.trg_payment_approval_votes_after_insert();

COMMIT;