#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API="$BASE_URL"
INTENT_ID="33333333-3333-4333-8333-333333333333"
MOBILE_SESSION_ID="88888888-8888-4888-8888-888888888888"
SPACE_ID="space-test-1"
WEB_DEVICE_ID="stage8b-audit-check"
PAYMENT_MEMBER_ID="44444444-4444-4444-8444-444444444444"

print_section() {
  printf '\n========== %s ==========\n' "$1"
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local body="$3"
  if [ "$expected" != "$actual" ]; then
    echo "HTTP inesperado. Esperado=$expected Actual=$actual"
    cat "$body"
    exit 1
  fi
}

print_section "prechecks stage7c and stage7d"
bash scripts/stage7c_smoke_test.sh
bash scripts/stage7d_smoke_test.sh

print_section "reset fixture after prechecks"
bash scripts/reset_stage7d_fixture.sh
bash scripts/reset_mobile_session_fixture.sh

print_section "crear web session QR"
SESSION_REQ_BODY="$(mktemp)"
SESSION_REQ_STATUS=$(curl -sS -o "$SESSION_REQ_BODY" -w '%{http_code}' -X POST "$API/public/v1/web/qr/session/request" \
  -H 'Content-Type: application/json' \
  -d "{\"deviceIdWeb\":\"$WEB_DEVICE_ID\"}")
assert_status 201 "$SESSION_REQ_STATUS" "$SESSION_REQ_BODY"
REQ_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sessionRequestId"])' "$SESSION_REQ_BODY")
cat "$SESSION_REQ_BODY"

print_section "confirmar web session"
SESSION_CONFIRM_BODY="$(mktemp)"
SESSION_CONFIRM_STATUS=$(curl -sS -o "$SESSION_CONFIRM_BODY" -w '%{http_code}' -X POST "$API/public/v1/web/qr/session/confirm" \
  -H 'Content-Type: application/json' \
  -H "x-session-id: $MOBILE_SESSION_ID" \
  -d "{\"sessionRequestId\":\"$REQ_ID\",\"deviceIdWeb\":\"$WEB_DEVICE_ID\",\"spaceId\":\"$SPACE_ID\"}")
assert_status 202 "$SESSION_CONFIRM_STATUS" "$SESSION_CONFIRM_BODY"
cat "$SESSION_CONFIRM_BODY"

print_section "web session status"
SESSION_STATUS_BODY="$(mktemp)"
SESSION_STATUS_STATUS=$(curl -sS -o "$SESSION_STATUS_BODY" -w '%{http_code}' "$API/public/v1/web/session/status?sessionRequestId=$REQ_ID")
assert_status 200 "$SESSION_STATUS_STATUS" "$SESSION_STATUS_BODY"
cat "$SESSION_STATUS_BODY"
WEB_SESSION_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sessionId"])' "$SESSION_STATUS_BODY")

print_section "pedir step-up payment approval"
STEP_REQ_BODY="$(mktemp)"
STEP_REQ_STATUS=$(curl -sS -o "$STEP_REQ_BODY" -w '%{http_code}' -X POST "$API/public/v1/auth/step-up/request" \
  -H 'Content-Type: application/json' \
  -d "{\"webSessionId\":\"$WEB_SESSION_ID\",\"spaceId\":\"$SPACE_ID\",\"actionType\":\"payment_intent_approve\",\"actionReferenceId\":\"$INTENT_ID\",\"deviceIdWeb\":\"$WEB_DEVICE_ID\"}")
assert_status 202 "$STEP_REQ_STATUS" "$STEP_REQ_BODY"
cat "$STEP_REQ_BODY"
PAYMENT_STEP_UP_SESSION_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["stepUpSessionId"])' "$STEP_REQ_BODY")

print_section "confirmar step-up"
STEP_CONFIRM_BODY="$(mktemp)"
STEP_CONFIRM_STATUS=$(curl -sS -o "$STEP_CONFIRM_BODY" -w '%{http_code}' -X POST "$API/public/v1/auth/step-up/confirm" \
  -H 'Content-Type: application/json' \
  -d "{\"stepUpSessionId\":\"$PAYMENT_STEP_UP_SESSION_ID\",\"userId\":\"user-test-1\",\"deviceIdMobile\":\"mobile-test-device-1\",\"decision\":\"approved\",\"biometricVerified\":true}")
assert_status 202 "$STEP_CONFIRM_STATUS" "$STEP_CONFIRM_BODY"
cat "$STEP_CONFIRM_BODY"

print_section "approval vote"
APPROVAL_BODY="$(mktemp)"
APPROVAL_STATUS=$(curl -sS -o "$APPROVAL_BODY" -w '%{http_code}' -X POST "$API/public/v1/finance/approvals/$INTENT_ID/vote" \
  -H 'Content-Type: application/json' \
  -H "X-Space-Id: 11111111-1111-1111-1111-111111111111" \
  -H "X-Member-Id: 44444444-4444-4444-8444-444444444444" \
  -H "x-web-session-id: $WEB_SESSION_ID" \
  -d '{"vote":"approve"}')
assert_status 200 "$APPROVAL_STATUS" "$APPROVAL_BODY"
cat "$APPROVAL_BODY"

print_section "pedir step-up para space switch"
SPACE_STEP_REQ_BODY="$(mktemp)"
SPACE_STEP_REQ_STATUS=$(curl -sS -o "$SPACE_STEP_REQ_BODY" -w '%{http_code}' -X POST "$API/public/v1/auth/step-up/request" \
  -H 'Content-Type: application/json' \
  -d "{\"webSessionId\":\"$WEB_SESSION_ID\",\"spaceId\":\"$SPACE_ID\",\"actionType\":\"space_switch\",\"actionReferenceId\":\"$SPACE_ID\",\"deviceIdWeb\":\"$WEB_DEVICE_ID\"}")
assert_status 202 "$SPACE_STEP_REQ_STATUS" "$SPACE_STEP_REQ_BODY"
cat "$SPACE_STEP_REQ_BODY"
SPACE_SWITCH_STEP_UP_SESSION_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["stepUpSessionId"])' "$SPACE_STEP_REQ_BODY")

print_section "confirmar step-up para space switch"
SPACE_STEP_CONFIRM_BODY="$(mktemp)"
SPACE_STEP_CONFIRM_STATUS=$(curl -sS -o "$SPACE_STEP_CONFIRM_BODY" -w '%{http_code}' -X POST "$API/public/v1/auth/step-up/confirm" \
  -H 'Content-Type: application/json' \
  -d "{\"stepUpSessionId\":\"$SPACE_SWITCH_STEP_UP_SESSION_ID\",\"userId\":\"user-test-1\",\"deviceIdMobile\":\"mobile-test-device-1\",\"decision\":\"approved\",\"biometricVerified\":true}")
assert_status 202 "$SPACE_STEP_CONFIRM_STATUS" "$SPACE_STEP_CONFIRM_BODY"
cat "$SPACE_STEP_CONFIRM_BODY"

print_section "space switch"
SPACE_SWITCH_BODY="$(mktemp)"
SPACE_SWITCH_STATUS=$(curl -sS -o "$SPACE_SWITCH_BODY" -w '%{http_code}' -X POST "$API/public/v1/identity/spaces/switch" \
  -H 'Content-Type: application/json' \
  -H "x-session-id: $MOBILE_SESSION_ID" \
  -H "x-web-session-id: $WEB_SESSION_ID" \
  -d "{\"space_id\":\"$SPACE_ID\"}")
assert_status 200 "$SPACE_SWITCH_STATUS" "$SPACE_SWITCH_BODY"
cat "$SPACE_SWITCH_BODY"

print_section "evidence"
EVIDENCE_BODY="$(mktemp)"
EVIDENCE_STATUS=$(curl -sS -o "$EVIDENCE_BODY" -w '%{http_code}' "$API/internal/v1/audit/evidence?limit=50")
assert_status 200 "$EVIDENCE_STATUS" "$EVIDENCE_BODY"
cat "$EVIDENCE_BODY"

python3 - "$EVIDENCE_BODY" <<'PY'
import json, sys
body = json.load(open(sys.argv[1]))
items = body.get('items', [])
assert body.get('ok') is True, 'ok=false'
assert body.get('chain_verified') is True, 'chain_verified=false'
event_types = {item.get('event_type') for item in items}
required = {
    'approval.vote.recorded',
    'step_up.verified',
    'space.switch.completed'
}
missing = sorted(required - event_types)
assert not missing, f'missing events: {missing}'
assert any(item.get('request_id') for item in items), 'missing request_id'
print('OK Stage 8B validado')
PY
