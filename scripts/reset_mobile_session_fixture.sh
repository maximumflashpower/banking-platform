#!/usr/bin/env bash
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-banking_postgres}"
MOBILE_SESSION_ID="${MOBILE_SESSION_ID:-88888888-8888-4888-8888-888888888888}"
USER_ID="${USER_ID:-user-test-1}"
DEVICE_ID_MOBILE="${DEVICE_ID_MOBILE:-99999999-9999-4999-8999-999999999999}"
SPACE_ID="${SPACE_ID:-space-test-1}"

docker exec -i "$POSTGRES_CONTAINER" sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d identity' <<SQL
BEGIN;

UPDATE sessions
SET
  user_id = '$USER_ID',
  device_id = '$DEVICE_ID_MOBILE',
  created_at = now(),
  expires_at = now() + interval '30 days',
  space_id = '$SPACE_ID',
  revoked_at = NULL
WHERE id = '$MOBILE_SESSION_ID'::uuid;

COMMIT;
SQL

echo "OK mobile session fixture reset"
