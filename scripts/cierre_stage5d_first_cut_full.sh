#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="$ROOT_DIR/../banking-platform-stage-backups/stage5d_first_cut"
LOG_DIR="$ROOT_DIR/logs"
ARCHIVE_DIR="$LOG_DIR/archive"

mkdir -p "$BACKUP_DIR" "$LOG_DIR" "$ARCHIVE_DIR"

TS="$(date +%F_%H%M%S)"
LOG_FILE="$LOG_DIR/cierre_stage5d_first_cut_$TS.log"

CARDHOLDER_ACCOUNT_ID="09e81c15-2b3c-48e4-846a-4a56c0d7983a"
CARD_ID="41dc3791-c90b-49fd-8d34-247d4cf6151e"
SPACE_ID="3cd1b39f-37d2-405d-aad0-c4758cb95003"

AUTH_EVENT_ID="evt_auth_stage5d_close_$TS"
AUTH_PROVIDER_AUTH_ID="auth_stage5d_close_$TS"
AUTH_IDEMPOTENCY_KEY="idem_auth_stage5d_close_$TS"

CAPTURE_EVENT_ID="cap_stage5d_close_$TS"

AUTH_EVENT_ID_REV="evt_auth_stage5d_rev_$TS"
AUTH_PROVIDER_AUTH_ID_REV="auth_stage5d_rev_$TS"
AUTH_IDEMPOTENCY_KEY_REV="idem_auth_stage5d_rev_$TS"

REVERSAL_EVENT_ID="rev_stage5d_close_$TS"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Stage 5D first cut closing started: $TS ==="

echo "[1/11] Archiving old Stage 5D logs..."
find "$LOG_DIR" -maxdepth 1 -type f -name 'cierre_stage5d_first_cut_*.log' ! -name "$(basename "$LOG_FILE")" -exec mv {} "$ARCHIVE_DIR"/ \; || true

echo "[2/11] Restarting api..."
docker compose restart api
until curl -sf http://localhost:3000/health >/dev/null; do sleep 1; done
curl -s http://localhost:3000/health | jq

echo "[3/11] Running Stage 5C closure baseline..."
bash "$ROOT_DIR/scripts/cierre_stage5c_final_full.sh"

echo "[4/11] Balance before tests..."
curl -s "http://localhost:3000/internal/v1/ledger/accounts/$CARDHOLDER_ACCOUNT_ID/balance?currency=USD" | jq

echo "[5/11] Creating fresh authorization for capture flow..."
curl -s -X POST http://localhost:3000/internal/v1/cards/webhooks/authorization \
  -H 'Content-Type: application/json' \
  -d "{
    \"provider\": \"processor-x\",
    \"provider_event_id\": \"$AUTH_EVENT_ID\",
    \"provider_auth_id\": \"$AUTH_PROVIDER_AUTH_ID\",
    \"idempotency_key\": \"$AUTH_IDEMPOTENCY_KEY\",
    \"card_id\": \"$CARD_ID\",
    \"space_id\": \"$SPACE_ID\",
    \"amount\": 1500,
    \"currency\": \"USD\",
    \"merchant_name\": \"Stage5D Close Capture\",
    \"merchant_mcc\": \"5812\"
  }" | tee /tmp/stage5d_auth_capture.json | jq

echo "[6/11] Capture total..."
curl -s -X POST http://localhost:3000/internal/v1/cards/webhooks/financial \
  -H 'Content-Type: application/json' \
  -d "{
    \"provider\": \"processor-x\",
    \"provider_event_id\": \"$CAPTURE_EVENT_ID\",
    \"provider_auth_id\": \"$AUTH_PROVIDER_AUTH_ID\",
    \"type\": \"capture\",
    \"amount\": 1500,
    \"currency\": \"USD\",
    \"occurred_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
  }" | tee /tmp/stage5d_capture.json | jq

echo "[7/11] Duplicate capture webhook..."
curl -s -X POST http://localhost:3000/internal/v1/cards/webhooks/financial \
  -H 'Content-Type: application/json' \
  -d "{
    \"provider\": \"processor-x\",
    \"provider_event_id\": \"$CAPTURE_EVENT_ID\",
    \"provider_auth_id\": \"$AUTH_PROVIDER_AUTH_ID\",
    \"type\": \"capture\",
    \"amount\": 1500,
    \"currency\": \"USD\",
    \"occurred_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
  }" | tee /tmp/stage5d_capture_dup.json | jq

echo "[8/11] Creating fresh authorization for reversal flow..."
curl -s -X POST http://localhost:3000/internal/v1/cards/webhooks/authorization \
  -H 'Content-Type: application/json' \
  -d "{
    \"provider\": \"processor-x\",
    \"provider_event_id\": \"$AUTH_EVENT_ID_REV\",
    \"provider_auth_id\": \"$AUTH_PROVIDER_AUTH_ID_REV\",
    \"idempotency_key\": \"$AUTH_IDEMPOTENCY_KEY_REV\",
    \"card_id\": \"$CARD_ID\",
    \"space_id\": \"$SPACE_ID\",
    \"amount\": 1500,
    \"currency\": \"USD\",
    \"merchant_name\": \"Stage5D Close Reversal\",
    \"merchant_mcc\": \"5812\"
  }" | tee /tmp/stage5d_auth_reversal.json | jq

echo "[9/11] Reversal without capture..."
curl -s -X POST http://localhost:3000/internal/v1/cards/webhooks/financial \
  -H 'Content-Type: application/json' \
  -d "{
    \"provider\": \"processor-x\",
    \"provider_event_id\": \"$REVERSAL_EVENT_ID\",
    \"provider_auth_id\": \"$AUTH_PROVIDER_AUTH_ID_REV\",
    \"type\": \"reversal\",
    \"amount\": 1500,
    \"currency\": \"USD\",
    \"occurred_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
  }" | tee /tmp/stage5d_reversal.json | jq

echo "[10/11] Duplicate reversal webhook..."
curl -s -X POST http://localhost:3000/internal/v1/cards/webhooks/financial \
  -H 'Content-Type: application/json' \
  -d "{
    \"provider\": \"processor-x\",
    \"provider_event_id\": \"$REVERSAL_EVENT_ID\",
    \"provider_auth_id\": \"$AUTH_PROVIDER_AUTH_ID_REV\",
    \"type\": \"reversal\",
    \"amount\": 1500,
    \"currency\": \"USD\",
    \"occurred_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
  }" | tee /tmp/stage5d_reversal_dup.json | jq

echo "[11/11] Evidence snapshot..."

echo "--- Balance after tests ---"
curl -s "http://localhost:3000/internal/v1/ledger/accounts/$CARDHOLDER_ACCOUNT_ID/balance?currency=USD" | jq

echo "--- Latest authorizations ---"
docker compose exec -T db psql -U app -d cards_db -c "
select id, provider_auth_id, status, hold_status, ledger_hold_ref, created_at
from card_authorizations
order by created_at desc
limit 20;
"

echo "--- Latest captures ---"
docker compose exec -T db psql -U app -d cards_db -c "
select id, authorization_id, provider_event_id, amount, currency, ledger_journal_entry_id, created_at
from card_captures
order by created_at desc
limit 20;
"

echo "--- Latest reversals ---"
docker compose exec -T db psql -U app -d cards_db -c "
select id, authorization_id, provider_event_id, amount, currency, created_at
from card_reversals
order by created_at desc
limit 20;
"

echo "--- Latest settlements ---"
docker compose exec -T db psql -U app -d cards_db -c "
select id, authorization_id, capture_id, provider_event_id, amount, currency, created_at
from card_settlements
order by created_at desc
limit 20;
"

echo "--- Latest holds ---"
docker compose exec -T db psql -U app -d financial_db -c "
select id, hold_ref, status, released_at, amount, currency, created_at
from ledger_holds
order by created_at desc
limit 20;
"

echo "--- Latest postings ---"
docker compose exec -T db psql -U app -d financial_db -c "
select id, journal_entry_id, account_id, direction, amount_minor, currency, created_at
from ledger_postings
order by created_at desc
limit 40;
"

echo "--- Latest webhook events ---"
docker compose exec -T db psql -U app -d cards_db -c "
select id, provider, provider_event_id, event_type, processing_status, received_at, processed_at, error_text
from cards_webhook_events
order by received_at desc
limit 20;
"

echo "Creating backups..."
rm -f "$BACKUP_DIR"/ledger_holds_stage5d_*.sql
rm -f "$BACKUP_DIR"/ledger_postings_stage5d_*.sql
rm -f "$BACKUP_DIR"/card_authorizations_stage5d_*.sql

docker compose exec -T db pg_dump -U app -d financial_db -t ledger_holds > "$BACKUP_DIR/ledger_holds_stage5d_$TS.sql"
docker compose exec -T db pg_dump -U app -d financial_db -t ledger_postings > "$BACKUP_DIR/ledger_postings_stage5d_$TS.sql"
docker compose exec -T db pg_dump -U app -d cards_db -t card_authorizations > "$BACKUP_DIR/card_authorizations_stage5d_$TS.sql"

echo "Backups created in: $BACKUP_DIR"
echo "Log file: $LOG_FILE"
echo "=== Stage 5D first cut closure finished ==="