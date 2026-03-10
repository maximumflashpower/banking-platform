#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="$ROOT_DIR/backups_stage5c_final"
LOG_DIR="$ROOT_DIR/logs"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

TS="$(date +%F_%H%M%S)"
LOG_FILE="$LOG_DIR/cierre_stage5c_final_$TS.log"
ACCOUNT_ID="09e81c15-2b3c-48e4-846a-4a56c0d7983a"

echo "🗒️ Iniciando cierre oficial Stage 5C..."
echo "📌 Registro de logs: $LOG_FILE"

echo "🧹 Limpiando backups previos de Stage 5C..."
rm -f "$BACKUP_DIR"/ledger_holds_stage5c_*.sql
rm -f "$BACKUP_DIR"/ledger_postings_stage5c_*.sql
rm -f "$BACKUP_DIR"/card_authorizations_stage5c_*.sql

echo "🔹 Ejecutando cierre idempotente..."
bash "$ROOT_DIR/scripts/cierre_stage5c_final.sh" 2>&1 | tee "$LOG_FILE"

echo "📌 Balance final..."
curl -s "http://localhost:3000/internal/v1/ledger/accounts/$ACCOUNT_ID/balance?currency=USD" | jq

echo "💾 Backup de ledger_holds desde Docker..."
docker compose exec -T db \
  pg_dump -U app -d financial_db -t ledger_holds \
  > "$BACKUP_DIR/ledger_holds_stage5c_$TS.sql"

echo "💾 Backup de ledger_postings desde Docker..."
docker compose exec -T db \
  pg_dump -U app -d financial_db -t ledger_postings \
  > "$BACKUP_DIR/ledger_postings_stage5c_$TS.sql"

echo "💾 Backup de card_authorizations desde Docker..."
docker compose exec -T db \
  pg_dump -U app -d cards_db -t card_authorizations \
  > "$BACKUP_DIR/card_authorizations_stage5c_$TS.sql"

echo "📌 Últimos 10 holds..."
docker compose exec -T db \
  psql -U app -d financial_db -c "SELECT id, hold_ref, status, released_at, amount, currency, created_at FROM ledger_holds ORDER BY created_at DESC LIMIT 10;"

echo "✅ Stage 5C finalizada con logs y backups."