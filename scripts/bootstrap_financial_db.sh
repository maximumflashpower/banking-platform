#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-banking_postgres}"
DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-financial_db}"

log() {
  echo "[bootstrap_financial_db] $*"
}

die() {
  echo "[bootstrap_financial_db][error] $*" >&2
  exit 1
}

apply_if_exists() {
  local file="$1"

  if [ -f "$file" ]; then
    log "applying $(basename "$file")"
    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$file" \
      || die "failed to apply $file"
  else
    log "skipping missing file $(basename "$file")"
  fi
}

log "checking financial_db existence"
if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  log "financial_db already exists"
else
  log "creating financial_db"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres < infra/postgres/initdb/002-create-financial-db.sql \
    || die "failed to create financial_db"
fi

apply_if_exists infra/postgres/initdb/010-init-financial-ledger-core.sql
apply_if_exists infra/postgres/initdb/012-stage3c-payment-approvals.sql
apply_if_exists infra/postgres/initdb/014-stage4a-ach-rail-core.sql
apply_if_exists infra/postgres/initdb/015-stage4b-ach-webhooks.sql
apply_if_exists infra/postgres/initdb/019-stage5c-ledger-holds.sql

log "financial_db ready"