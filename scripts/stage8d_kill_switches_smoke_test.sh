#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

wait_api() {
  for i in $(seq 1 30); do
    if curl -fsS "$BASE_URL/health" >/dev/null; then
      echo "API OK"
      return 0
    fi
    echo "esperando api... intento $i/30"
    sleep 1
  done
  echo "ERROR: API no saludable"
  return 1
}

echo "== Stage 8D smoke =="

echo "-- caso 1: ACH OFF, cards ON --"
RAILS_ACH_ENABLED=false RAILS_CARDS_ENABLED=true docker compose up -d --build api >/dev/null
wait_api

curl -fsS "$BASE_URL/health" | grep -q '"ach_enabled":false'
curl -fsS "$BASE_URL/health" | grep -q '"cards_enabled":true'

bash scripts/stage7c_smoke_test.sh
bash scripts/stage7d_smoke_test.sh
bash scripts/stage8b_audit_smoke_test.sh

ACH_STATUS=$(
  curl -s -o /tmp/stage8d_ach_off.json -w "%{http_code}" \
    -X POST "$BASE_URL/internal/v1/payments/rails/ach/submit" \
    -H 'Content-Type: application/json' \
    -d '{"payment_intent_id":"00000000-0000-0000-0000-000000000000"}'
)

test "$ACH_STATUS" = "503"
grep -q '"code":"rail_disabled"' /tmp/stage8d_ach_off.json
grep -q '"rail":"ach"' /tmp/stage8d_ach_off.json

echo "-- caso 2: cards OFF, ACH ON --"
RAILS_ACH_ENABLED=true RAILS_CARDS_ENABLED=false docker compose up -d --build api >/dev/null
wait_api

curl -fsS "$BASE_URL/health" | grep -q '"ach_enabled":true'
curl -fsS "$BASE_URL/health" | grep -q '"cards_enabled":false'

bash scripts/stage7c_smoke_test.sh
bash scripts/stage7d_smoke_test.sh
bash scripts/stage8b_audit_smoke_test.sh

CARD_STATUS=$(
  curl -s -o /tmp/stage8d_cards_off.json -w "%{http_code}" \
    -X POST "$BASE_URL/internal/v1/cards/auth-decision" \
    -H 'Content-Type: application/json' \
    -d '{"authorization_id":"00000000-0000-0000-0000-000000000000","space_id":"00000000-0000-0000-0000-000000000000","amount":100}'
)

test "$CARD_STATUS" = "200"
grep -q '"decline_reason":"rail_disabled"' /tmp/stage8d_cards_off.json

echo "-- restaurando ambos rails ON --"
RAILS_ACH_ENABLED=true RAILS_CARDS_ENABLED=true docker compose up -d --build api >/dev/null
wait_api

echo "OK Stage 8D validado"