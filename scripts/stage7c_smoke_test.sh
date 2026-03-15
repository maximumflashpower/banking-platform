#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

DEVICE_ID_WEB="${DEVICE_ID_WEB:-web-chrome-jose-001}"
DEVICE_ID_MOBILE="${DEVICE_ID_MOBILE:-99999999-9999-4999-8999-999999999999}"

MOBILE_SESSION_ID="${MOBILE_SESSION_ID:-88888888-8888-4888-8888-888888888888}"

IDENTITY_SPACE_ID="${IDENTITY_SPACE_ID:-space-test-1}"
FINANCIAL_SPACE_ID="${FINANCIAL_SPACE_ID:-11111111-1111-1111-1111-111111111111}"

USER_ID="${USER_ID:-user-test-1}"
MEMBER_ID="${MEMBER_ID:-55555555-5555-4555-8555-555555555555}"

PAYMENT_INTENT_ID="${PAYMENT_INTENT_ID:-33333333-3333-4333-8333-333333333333}"

STEP_UP_TTL_SECONDS="${STEP_UP_TTL_SECONDS:-300}"

TMPDIR_STAGE7D="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_STAGE7D"' EXIT

RESET_STAGE7D_SCRIPT="/home/ubuntu-777/projects/banking-platform/scripts/reset_stage7d_fixture.sh"
RESET_MOBILE_SESSION_SCRIPT="/home/ubuntu-777/projects/banking-platform/scripts/reset_mobile_session_fixture.sh"

if [[ -x "$RESET_STAGE7D_SCRIPT" ]]; then
  "$RESET_STAGE7D_SCRIPT"
fi

if [[ -x "$RESET_MOBILE_SESSION_SCRIPT" ]]; then
  MOBILE_SESSION_ID="$MOBILE_SESSION_ID" \
  USER_ID="$USER_ID" \
  DEVICE_ID_MOBILE="$DEVICE_ID_MOBILE" \
  SPACE_ID="$IDENTITY_SPACE_ID" \
  "$RESET_MOBILE_SESSION_SCRIPT"
fi

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

request_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"

  shift 3 || true

  local body_file="$TMPDIR_STAGE7D/body.json"
  local code_file="$TMPDIR_STAGE7D/code.txt"

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

print_section "health OK"
request_json "GET" "$BASE_URL/health" ""
assert_status "200"
echo "$RESPONSE_BODY"

########################################################
# approvals vote sin step-up
########################################################

print_section "approvals vote sin step-up falla"

request_json "POST" \
  "$BASE_URL/public/v1/finance/approvals/$PAYMENT_INTENT_ID/vote" \
  "{\"vote\":\"approve\"}" \
  -H "Content-Type: application/json" \
  -H "X-Space-Id: $FINANCIAL_SPACE_ID" \
  -H "X-Member-Id: $MEMBER_ID" \
  -H "x-web-session-id: 11111111-1111-4111-8111-111111111111"

assert_status "403"
echo "$RESPONSE_BODY"

########################################################
# crear web session
########################################################

print_section "crear web session QR"

request_json "POST" \
  "$BASE_URL/public/v1/web/qr/session/request" \
  "{\"deviceIdWeb\":\"$DEVICE_ID_WEB\"}" \
  -H "Content-Type: application/json"

assert_status "201"
echo "$RESPONSE_BODY"

SESSION_REQUEST_ID="$(printf '%s' "$RESPONSE_BODY" | json_get sessionRequestId)"
echo "SESSION_REQUEST_ID=$SESSION_REQUEST_ID"

########################################################
# confirmar web session
########################################################

print_section "confirmar web session"

request_json "POST" \
  "$BASE_URL/public/v1/web/qr/session/confirm" \
  "{
    \"sessionRequestId\": \"$SESSION_REQUEST_ID\",
    \"deviceIdWeb\": \"$DEVICE_ID_WEB\",
    \"spaceId\": \"$IDENTITY_SPACE_ID\"
  }" \
  -H "Content-Type: application/json" \
  -H "x-session-id: $MOBILE_SESSION_ID"

assert_status "202"
echo "$RESPONSE_BODY"

########################################################
# web session status
########################################################

print_section "web session status"

request_json "GET" \
  "$BASE_URL/public/v1/web/session/status?sessionRequestId=$SESSION_REQUEST_ID" ""

assert_status "200"
echo "$RESPONSE_BODY"

WEB_SESSION_ID="$(printf '%s' "$RESPONSE_BODY" | json_get sessionId)"
echo "WEB_SESSION_ID=$WEB_SESSION_ID"

########################################################
# pedir step-up approvals
########################################################

print_section "pedir step-up para payment_intent_approve"

request_json "POST" \
  "$BASE_URL/public/v1/auth/step-up/request" \
  "{
    \"webSessionId\": \"$WEB_SESSION_ID\",
    \"spaceId\": \"$IDENTITY_SPACE_ID\",
    \"actionType\": \"payment_intent_approve\",
    \"actionReferenceId\": \"$PAYMENT_INTENT_ID\",
    \"deviceIdWeb\": \"$DEVICE_ID_WEB\",
    \"reason\": \"Stage 7D approvals\",
    \"ttlSeconds\": $STEP_UP_TTL_SECONDS
  }" \
  -H "Content-Type: application/json"

assert_status "202"
echo "$RESPONSE_BODY"

PAYMENT_STEP_UP_SESSION_ID="$(printf '%s' "$RESPONSE_BODY" | json_get stepUpSessionId)"
echo "PAYMENT_STEP_UP_SESSION_ID=$PAYMENT_STEP_UP_SESSION_ID"

########################################################
# confirmar step-up
########################################################

print_section "confirmar step-up desde mobile"

request_json "POST" \
  "$BASE_URL/public/v1/auth/step-up/confirm" \
  "{
    \"stepUpSessionId\": \"$PAYMENT_STEP_UP_SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"deviceIdMobile\": \"$DEVICE_ID_MOBILE\",
    \"decision\": \"approved\",
    \"biometricVerified\": true
  }" \
  -H "Content-Type: application/json"

assert_status "202"
echo "$RESPONSE_BODY"

########################################################
# approvals vote con step-up
########################################################

print_section "approvals vote con step-up pasa"

request_json "POST" \
  "$BASE_URL/public/v1/finance/approvals/$PAYMENT_INTENT_ID/vote" \
  "{\"vote\":\"approve\"}" \
  -H "Content-Type: application/json" \
  -H "X-Space-Id: $FINANCIAL_SPACE_ID" \
  -H "X-Member-Id: $MEMBER_ID" \
  -H "x-web-session-id: $WEB_SESSION_ID"

assert_status "200"
echo "$RESPONSE_BODY"

########################################################
# reuse step-up approvals
########################################################

print_section "reutilizacion del mismo step-up falla"

request_json "POST" \
  "$BASE_URL/public/v1/finance/approvals/$PAYMENT_INTENT_ID/vote" \
  "{\"vote\":\"approve\"}" \
  -H "Content-Type: application/json" \
  -H "X-Space-Id: $FINANCIAL_SPACE_ID" \
  -H "X-Member-Id: $MEMBER_ID" \
  -H "x-web-session-id: $WEB_SESSION_ID"

if [[ "$RESPONSE_CODE" != "403" && "$RESPONSE_CODE" != "409" ]]; then
  echo "HTTP inesperado para reuse approvals. Actual=$RESPONSE_CODE"
  echo "$RESPONSE_BODY"
  exit 1
fi

echo "$RESPONSE_BODY"

########################################################
# step-up space switch
########################################################

print_section "pedir step-up para space_switch"

request_json "POST" \
  "$BASE_URL/public/v1/auth/step-up/request" \
  "{
    \"webSessionId\": \"$WEB_SESSION_ID\",
    \"spaceId\": \"$IDENTITY_SPACE_ID\",
    \"actionType\": \"space_switch\",
    \"actionReferenceId\": \"$IDENTITY_SPACE_ID\",
    \"deviceIdWeb\": \"$DEVICE_ID_WEB\",
    \"reason\": \"Stage 7D space switch\",
    \"ttlSeconds\": $STEP_UP_TTL_SECONDS
  }" \
  -H "Content-Type: application/json"

assert_status "202"
echo "$RESPONSE_BODY"

SPACE_SWITCH_STEP_UP_SESSION_ID="$(printf '%s' "$RESPONSE_BODY" | json_get stepUpSessionId)"
echo "SPACE_SWITCH_STEP_UP_SESSION_ID=$SPACE_SWITCH_STEP_UP_SESSION_ID"

########################################################
# confirmar step-up space switch
########################################################

print_section "confirmar step-up para spaces/switch"

request_json "POST" \
  "$BASE_URL/public/v1/auth/step-up/confirm" \
  "{
    \"stepUpSessionId\": \"$SPACE_SWITCH_STEP_UP_SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"deviceIdMobile\": \"$DEVICE_ID_MOBILE\",
    \"decision\": \"approved\",
    \"biometricVerified\": true
  }" \
  -H "Content-Type: application/json"

assert_status "202"
echo "$RESPONSE_BODY"

########################################################
# ejecutar space switch
########################################################

print_section "spaces/switch con step-up pasa"

request_json "POST" \
  "$BASE_URL/public/v1/identity/spaces/switch" \
  "{\"space_id\":\"$IDENTITY_SPACE_ID\"}" \
  -H "Content-Type: application/json" \
  -H "x-session-id: $MOBILE_SESSION_ID" \
  -H "x-web-session-id: $WEB_SESSION_ID"

assert_status "200"
echo "$RESPONSE_BODY"

########################################################
# reuse step-up space switch
########################################################

print_section "reutilizacion de step-up en spaces/switch falla"

request_json "POST" \
  "$BASE_URL/public/v1/identity/spaces/switch" \
  "{\"space_id\":\"$IDENTITY_SPACE_ID\"}" \
  -H "Content-Type: application/json" \
  -H "x-session-id: $MOBILE_SESSION_ID" \
  -H "x-web-session-id: $WEB_SESSION_ID"

if [[ "$RESPONSE_CODE" != "403" && "$RESPONSE_CODE" != "409" ]]; then
  echo "HTTP inesperado para reuse space_switch. Actual=$RESPONSE_CODE"
  echo "$RESPONSE_BODY"
  exit 1
fi

echo "$RESPONSE_BODY"

########################################################

print_section "resultado final"
echo "OK Stage 7D validado"
echo "SESSION_REQUEST_ID=$SESSION_REQUEST_ID"
echo "WEB_SESSION_ID=$WEB_SESSION_ID"
echo "PAYMENT_STEP_UP_SESSION_ID=$PAYMENT_STEP_UP_SESSION_ID"
echo "SPACE_SWITCH_STEP_UP_SESSION_ID=$SPACE_SWITCH_STEP_UP_SESSION_ID"