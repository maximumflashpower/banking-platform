#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
DEVICE_ID_WEB="${DEVICE_ID_WEB:-web-chrome-jose-001}"
DEVICE_ID_MOBILE="${DEVICE_ID_MOBILE:-99999999-9999-4999-8999-999999999999}"
MOBILE_SESSION_ID="${MOBILE_SESSION_ID:-88888888-8888-4888-8888-888888888888}"
SPACE_ID="${SPACE_ID:-space-test-1}"
USER_ID="${USER_ID:-user-test-1}"
ACTION_TYPE="${ACTION_TYPE:-payment_intent_approve}"
ACTION_REFERENCE_ID="${ACTION_REFERENCE_ID:-33333333-3333-4333-8333-333333333333}"
STEP_UP_REASON="${STEP_UP_REASON:-Stage 7C real test}"
STEP_UP_TTL_SECONDS="${STEP_UP_TTL_SECONDS:-300}"

TMPDIR_STAGE7C="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_STAGE7C"' EXIT

print_section() {
  printf '\n========== %s ==========\n' "$1"
}

json_get() {
  local key="$1"
  python3 -c '
import json, sys
key = sys.argv[1]
data = json.load(sys.stdin)
value = data[key]
if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("null")
else:
    print(value)
' "$key"
}

json_assert_equals() {
  local key="$1"
  local expected="$2"
  python3 -c '
import json, sys
key = sys.argv[1]
expected = sys.argv[2]
data = json.load(sys.stdin)
value = data[key]
if isinstance(value, bool):
    actual = "true" if value else "false"
elif value is None:
    actual = "null"
else:
    actual = str(value)
if actual != expected:
    raise SystemExit(f"Assertion failed for {key}: expected={expected} actual={actual}")
' "$key" "$expected"
}

request_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  shift 3 || true

  local body_file="$TMPDIR_STAGE7C/body.json"
  local code_file="$TMPDIR_STAGE7C/code.txt"

  if [[ -n "$body" ]]; then
    curl -sS \
      -X "$method" \
      "$url" \
      "$@" \
      -d "$body" \
      -o "$body_file" \
      -w "%{http_code}" > "$code_file"
  else
    curl -sS \
      -X "$method" \
      "$url" \
      "$@" \
      -o "$body_file" \
      -w "%{http_code}" > "$code_file"
  fi

  RESPONSE_CODE="$(cat "$code_file")"
  RESPONSE_BODY="$(cat "$body_file")"
}

assert_status() {
  local expected="$1"
  if [[ "$RESPONSE_CODE" != "$expected" ]]; then
    echo "HTTP inesperado. Esperado=$expected Actual=$RESPONSE_CODE"
    echo "$RESPONSE_BODY"
    exit 1
  fi
}

print_section "health"
request_json "GET" "$BASE_URL/health" ""
assert_status "200"
echo "$RESPONSE_BODY"

print_section "web qr session request"
request_json "POST" "$BASE_URL/public/v1/web/qr/session/request" \
  "{\"deviceIdWeb\":\"$DEVICE_ID_WEB\"}" \
  -H "Content-Type: application/json"
assert_status "201"
echo "$RESPONSE_BODY"

SESSION_REQUEST_ID="$(printf '%s' "$RESPONSE_BODY" | json_get sessionRequestId)"
echo "SESSION_REQUEST_ID=$SESSION_REQUEST_ID"

print_section "web qr session confirm"
request_json "POST" "$BASE_URL/public/v1/web/qr/session/confirm" \
  "{
    \"sessionRequestId\": \"$SESSION_REQUEST_ID\",
    \"deviceIdWeb\": \"$DEVICE_ID_WEB\",
    \"spaceId\": \"$SPACE_ID\"
  }" \
  -H "Content-Type: application/json" \
  -H "x-session-id: $MOBILE_SESSION_ID"
assert_status "202"
echo "$RESPONSE_BODY"

print_section "web session status"
request_json "GET" "$BASE_URL/public/v1/web/session/status?sessionRequestId=$SESSION_REQUEST_ID" ""
assert_status "200"
echo "$RESPONSE_BODY"

WEB_SESSION_ID="$(printf '%s' "$RESPONSE_BODY" | json_get sessionId)"
printf '%s' "$RESPONSE_BODY" | json_assert_equals status active
echo "WEB_SESSION_ID=$WEB_SESSION_ID"

print_section "step-up request"
request_json "POST" "$BASE_URL/public/v1/auth/step-up/request" \
  "{
    \"webSessionId\": \"$WEB_SESSION_ID\",
    \"spaceId\": \"$SPACE_ID\",
    \"actionType\": \"$ACTION_TYPE\",
    \"actionReferenceId\": \"$ACTION_REFERENCE_ID\",
    \"deviceIdWeb\": \"$DEVICE_ID_WEB\",
    \"reason\": \"$STEP_UP_REASON\",
    \"ttlSeconds\": $STEP_UP_TTL_SECONDS
  }" \
  -H "Content-Type: application/json"
assert_status "202"
echo "$RESPONSE_BODY"

STEP_UP_SESSION_ID="$(printf '%s' "$RESPONSE_BODY" | json_get stepUpSessionId)"
printf '%s' "$RESPONSE_BODY" | json_assert_equals status pending_verification
echo "STEP_UP_SESSION_ID=$STEP_UP_SESSION_ID"

print_section "step-up confirm"
request_json "POST" "$BASE_URL/public/v1/auth/step-up/confirm" \
  "{
    \"stepUpSessionId\": \"$STEP_UP_SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"deviceIdMobile\": \"$DEVICE_ID_MOBILE\",
    \"decision\": \"approved\",
    \"biometricVerified\": true
  }" \
  -H "Content-Type: application/json"
assert_status "202"
echo "$RESPONSE_BODY"
printf '%s' "$RESPONSE_BODY" | json_assert_equals status verified
printf '%s' "$RESPONSE_BODY" | json_assert_equals biometricVerified true

print_section "step-up status"
request_json "GET" "$BASE_URL/public/v1/auth/step-up/status?stepUpSessionId=$STEP_UP_SESSION_ID" ""
assert_status "200"
echo "$RESPONSE_BODY"
printf '%s' "$RESPONSE_BODY" | json_assert_equals status verified

print_section "resultado final"
echo "OK Stage 7C validado"
echo "SESSION_REQUEST_ID=$SESSION_REQUEST_ID"
echo "WEB_SESSION_ID=$WEB_SESSION_ID"
echo "STEP_UP_SESSION_ID=$STEP_UP_SESSION_ID"
