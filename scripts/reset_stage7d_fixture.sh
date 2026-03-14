#!/usr/bin/env bash
set -euo pipefail

docker exec -i banking_postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d financial_db' <<'SQL'
BEGIN;

DELETE FROM payment_approval_votes
WHERE approval_id IN (
  SELECT id
  FROM payment_approvals
  WHERE payment_intent_id = '33333333-3333-4333-8333-333333333333'::uuid
);

UPDATE payment_approvals
SET
  status = 'pending',
  approvals_count = 0,
  rejections_count = 0,
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = NOW()
WHERE payment_intent_id = '33333333-3333-4333-8333-333333333333'::uuid;

DELETE FROM payment_intent_states
WHERE payment_intent_id = '33333333-3333-4333-8333-333333333333'::uuid
  AND state IN ('approved', 'rejected');

COMMIT;
SQL

echo "OK Stage 7D fixture reset"