#!/bin/bash
# cierre_stage5c_final.sh - Cierre idempotente Stage 5C
set -euo pipefail

echo "🗒️ Iniciando cierre oficial Stage 5C..."

SPACE_ID="3cd1b39f-37d2-405d-aad0-c4758cb95003"
USER_ID="3913e947-d2d8-4f61-ad52-110959e674da"
CARD_ID="41dc3791-c90b-49fd-8d34-247d4cf6151e"
ACCOUNT_ID="09e81c15-2b3c-48e4-846a-4a56c0d7983a"
PROVIDER="processor-x"
AMOUNT=1500
CURRENCY="USD"
MERCHANT_NAME="ACME STORE"
MERCHANT_MCC="5411"

TIMESTAMP=$(date +%s)
LOG_FILE="./cierre_stage5c_final_$(date +%F_%H%M%S).log"

echo "📌 Registro de logs: $LOG_FILE"

EXISTING_HOLD=$(psql -X -qAt postgresql://app:app@localhost:5432/cards_db -c "
SELECT ledger_hold_ref
FROM card_authorizations
WHERE card_id = '$CARD_ID'
  AND provider_auth_id = 'auth_stage5c_final'
LIMIT 1;
")

if [ -n "$EXISTING_HOLD" ]; then
  echo "⚠️ Hold ya existe: $EXISTING_HOLD" | tee -a "$LOG_FILE"
  LEDGER_HOLD_REF="$EXISTING_HOLD"
else
  echo "📌 Creando autorización final (hold)..." | tee -a "$LOG_FILE"
  AUTH_RESPONSE=$(curl -s -X POST http://localhost:3000/internal/v1/cards/auth-decision \
    -H "Content-Type: application/json" \
    -d "{
      \"provider\":\"$PROVIDER\",
      \"providerEventId\":\"evt_stage5c_final_$TIMESTAMP\",
      \"providerAuthId\":\"auth_stage5c_final\",
      \"cardId\":\"$CARD_ID\",
      \"amount\":$AMOUNT,
      \"currency\":\"$CURRENCY\",
      \"merchantName\":\"$MERCHANT_NAME\",
      \"merchantMcc\":\"$MERCHANT_MCC\"
    }")

  LEDGER_HOLD_REF=$(echo "$AUTH_RESPONSE" | jq -r '.data.ledgerHoldRef // empty')
  LEDGER_HOLD_ID=$(echo "$AUTH_RESPONSE" | jq -r '.data.ledgerHoldId // empty')

  echo "✅ Hold creado: ledgerHoldRef=$LEDGER_HOLD_REF ledgerHoldId=$LEDGER_HOLD_ID" | tee -a "$LOG_FILE"
fi

echo "📌 Balance con hold activo..." | tee -a "$LOG_FILE"
curl -s "http://localhost:3000/internal/v1/ledger/accounts/$ACCOUNT_ID/balance?currency=$CURRENCY" | jq | tee -a "$LOG_FILE"

HOLD_STATUS=$(psql -X -qAt postgresql://app:app@localhost:5432/financial_db -c "
SELECT status
FROM ledger_holds
WHERE hold_ref = '$LEDGER_HOLD_REF'
LIMIT 1;
")

if [ "$HOLD_STATUS" = "released" ]; then
  echo "⚠️ Hold ya liberado: $LEDGER_HOLD_REF" | tee -a "$LOG_FILE"
else
  echo "📌 Liberando hold..." | tee -a "$LOG_FILE"
  RELEASE_RESPONSE=$(curl -s -X POST http://localhost:3000/internal/v1/ledger/holds/release \
    -H "Content-Type: application/json" \
    -d "{
      \"holdRef\":\"$LEDGER_HOLD_REF\",
      \"reason\":\"manual_release\"
    }")
  echo "$RELEASE_RESPONSE" | jq | tee -a "$LOG_FILE"
fi

echo "📌 Balance final tras liberación..." | tee -a "$LOG_FILE"
curl -s "http://localhost:3000/internal/v1/ledger/accounts/$ACCOUNT_ID/balance?currency=$CURRENCY" | jq | tee -a "$LOG_FILE"

echo "🎯 Cierre Stage 5C completado." | tee -a "$LOG_FILE"