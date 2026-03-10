#!/bin/bash
# cierre_stage5c_idempotente.sh - Cierre Stage 5C de forma segura
# Guardar en la raíz del proyecto

set -euo pipefail

# Configuración Stage 5C
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
LOG_FILE="./cierre_stage5c_$(date +%F_%H%M%S).log"
BACKUP_DIR="./backups_stage5c"
mkdir -p "$BACKUP_DIR"

echo "🗒️  Iniciando cierre Stage 5C (idempotente)" | tee -a "$LOG_FILE"

# -----------------------------
# 1️⃣ Crear autorización final (si no existe)
# -----------------------------
EXISTING_HOLD=$(psql -X -qAt postgresql://app:app@localhost:5432/cards_db -c "
SELECT ledger_hold_ref
FROM card_authorizations
WHERE card_id = '$CARD_ID'
  AND provider_auth_id = 'auth_stage5c_final'
LIMIT 1;
")

if [ -n "$EXISTING_HOLD" ]; then
  echo "⚠️  Hold ya existe: $EXISTING_HOLD" | tee -a "$LOG_FILE"
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
  LEDGER_HOLD_REF=$(echo "$AUTH_RESPONSE" | jq -r '.data.ledgerHoldRef')
  LEDGER_HOLD_ID=$(echo "$AUTH_RESPONSE" | jq -r '.data.ledgerHoldId')
  echo "✅ Hold creado: ledgerHoldRef=$LEDGER_HOLD_REF ledgerHoldId=$LEDGER_HOLD_ID" | tee -a "$LOG_FILE"
fi

# -----------------------------
# 2️⃣ Verificar balances antes de release
# -----------------------------
echo "📌 Balance con hold activo..." | tee -a "$LOG_FILE"
curl -s "http://localhost:3000/internal/v1/ledger/accounts/$ACCOUNT_ID/balance?currency=$CURRENCY" | jq | tee -a "$LOG_FILE"

# -----------------------------
# 3️⃣ Liberar hold solo si está activo
# -----------------------------
HOLD_STATUS=$(psql -X -qAt postgresql://app:app@localhost:5432/financial_db -c "
SELECT status
FROM ledger_holds
WHERE hold_ref = '$LEDGER_HOLD_REF';
")

if [ "$HOLD_STATUS" = "released" ]; then
  echo "⚠️  Hold ya liberado: $LEDGER_HOLD_REF" | tee -a "$LOG_FILE"
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

# -----------------------------
# 4️⃣ Verificar balances finales
# -----------------------------
echo "📌 Balance final tras liberación..." | tee -a "$LOG_FILE"
curl -s "http://localhost:3000/internal/v1/ledger/accounts/$ACCOUNT_ID/balance?currency=$CURRENCY" | jq | tee -a "$LOG_FILE"

# -----------------------------
# 5️⃣ Backups SQL de auditoría
# -----------------------------
echo "💾 Realizando backup de datos relevantes..." | tee -a "$LOG_FILE"

TABLES=("ledger_holds" "card_authorizations" "ledger_postings" "ledger_accounts")
for T in "${TABLES[@]}"; do
    BACKUP_FILE="$BACKUP_DIR/${T}_stage5c_$(date +%F_%H%M%S).sql"
    echo "🔹 Exportando $T -> $BACKUP_FILE" | tee -a "$LOG_FILE"
    pg_dump -U app -d financial_db -t "$T" --data-only > "$BACKUP_FILE"
done

echo "🎯 Cierre Stage 5C completado. Todos los logs y backups están en $BACKUP_DIR" | tee -a "$LOG_FILE"