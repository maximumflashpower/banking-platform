#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

# Reemplaza estos valores por UUIDs reales de tu entorno.
WEB_SESSION_ID="${WEB_SESSION_ID:-11111111-1111-1111-1111-111111111111}"
SPACE_ID="${SPACE_ID:-22222222-2222-2222-2222-222222222222}"
ACTION_REFERENCE_ID="${ACTION_REFERENCE_ID:-33333333-3333-3333-3333-333333333333}"
DEVICE_ID_WEB="${DEVICE_ID_WEB:-44444444-4444-4444-4444-444444444444}"
USER_ID="${USER_ID:-55555555-5555-5555-5555-555555555555}"
DEVICE_ID_MOBILE="${DEVICE_ID_MOBILE:-66666666-6666-6666-6666-666666666666}"

ACTION_TYPE="${ACTION_TYPE:-payment_intent_approve}"
TTL_SECONDS="${TTL_SECONDS:-300}"
POLL_ATTEMPTS="${POLL_ATTEMPTS:-15}"
POLL_SLEEP_SECONDS="${POLL_SLEEP_SECONDS:-2}"

TMP_DIR="$(mktemp -d)"
REQUEST_BODY_FILE="$TMP_DIR/request.json"
REQUEST_RESP_FILE="$TMP_DIR/request-response.json"
CONFIRM_BODY_FILE="$TMP_DIR/confirm.json"
CONFIRM_RESP_FILE="$TMP_DIR/confirm-response.json"
STATUS_RESP_FILE="$TMP_DIR/status-response.json"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: falta comando requerido: $cmd" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd python3

echo
echo "== Stage 7C E2E =="
echo "BASE_URL=$BASE_URL"
echo "WEB_SESSION_ID=$WEB_SESSION_ID"
echo "SPACE_ID=$SPACE_ID"
echo "ACTION_REFERENCE_ID=$ACTION_REFERENCE_ID"
echo

cat > "$REQUEST_BODY_FILE" <<JSON
{
  "webSessionId": "$WEB_SESSION_ID",
  "spaceId": "$SPACE_ID",
  "actionType": "$ACTION_TYPE",
  "actionReferenceId": "$ACTION_REFERENCE_ID",
  "deviceIdWeb": "$DEVICE_ID_WEB",
  "reason": "Stage 7C cross-device E2E",
  "ttlSeconds": $TTL_SECONDS
}
JSON

echo "1) POST /public/v1/auth/step-up/request"
REQUEST_STATUS="$(
  curl -sS \
    -o "$REQUEST_RESP_FILE" \
    -w "%{http_code}" \
    -X POST "$BASE_URL/public/v1/auth/step-up/request" \
    -H 'Content-Type: application/json' \
    --data @"$REQUEST_BODY_FILE"
)"

echo "HTTP $REQUEST_STATUS"
cat "$REQUEST_RESP_FILE"
echo

if [[ "$REQUEST_STATUS" != "202" && "$REQUEST_STATUS" != "200" ]]; then
  echo "ERROR: request step-up fallo" >&2
  exit 1
fi

STEP_UP_SESSION_ID="$(
  python3 - "$REQUEST_RESP_FILE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

candidates = [
    data.get("stepUpSessionId"),
    data.get("step_up_session_id"),
    data.get("step_up_session", {}).get("id"),
    data.get("stepUpSession", {}).get("id"),
]
for value in candidates:
    if value:
        print(value)
        raise SystemExit(0)

raise SystemExit(1)
PY
)" || {
  echo "ERROR: no pude extraer stepUpSessionId de la respuesta" >&2
  exit 1
}

echo "stepUpSessionId=$STEP_UP_SESSION_ID"
echo

cat > "$CONFIRM_BODY_FILE" <<JSON
{
  "stepUpSessionId": "$STEP_UP_SESSION_ID",
  "userId": "$USER_ID",
  "deviceIdMobile": "$DEVICE_ID_MOBILE",
  "decision": "approved",
  "biometricVerified": true
}
JSON

echo "2) POST /public/v1/auth/step-up/confirm"
CONFIRM_STATUS="$(
  curl -sS \
    -o "$CONFIRM_RESP_FILE" \
    -w "%{http_code}" \
    -X POST "$BASE_URL/public/v1/auth/step-up/confirm" \
    -H 'Content-Type: application/json' \
    --data @"$CONFIRM_BODY_FILE"
)"

echo "HTTP $CONFIRM_STATUS"
cat "$CONFIRM_RESP_FILE"
echo

if [[ "$CONFIRM_STATUS" != "202" && "$CONFIRM_STATUS" != "200" ]]; then
  echo "ERROR: confirm step-up fallo" >&2
  exit 1
fi

echo "3) GET /public/v1/auth/step-up/status"
FOUND_FINAL_STATE="false"

for attempt in $(seq 1 "$POLL_ATTEMPTS"); do
  STATUS_CODE="$(
    curl -sS \
      -o "$STATUS_RESP_FILE" \
      -w "%{http_code}" \
      "$BASE_URL/public/v1/auth/step-up/status?stepUpSessionId=$STEP_UP_SESSION_ID"
  )"

  echo "Poll #$attempt -> HTTP $STATUS_CODE"
  cat "$STATUS_RESP_FILE"
  echo

  if [[ "$STATUS_CODE" != "200" ]]; then
    echo "ERROR: status polling fallo" >&2
    exit 1
  fi

  STATE="$(
    python3 - "$STATUS_RESP_FILE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

value = data.get("state") or data.get("status")
if value:
    print(value)
PY
  )"

  if [[ "$STATE" == "verified" || "$STATE" == "approved" ]]; then
    FOUND_FINAL_STATE="true"
    echo "OK: step-up finalizado en estado $STATE"
    break
  fi

  if [[ "$STATE" == "expired" || "$STATE" == "cancelled" ]]; then
    echo "ERROR: step-up termino en estado $STATE" >&2
    exit 1
  fi

  sleep "$POLL_SLEEP_SECONDS"
done

if [[ "$FOUND_FINAL_STATE" != "true" ]]; then
  echo "ERROR: no se alcanzo estado final dentro del polling esperado" >&2
  exit 1
fi

echo
echo "Stage 7C E2E OK"
echo "stepUpSessionId=$STEP_UP_SESSION_ID"