#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-banking_postgres}"
DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-cards_db}"

log() {
  echo "[bootstrap_cards_db] $*"
}

die() {
  echo "[bootstrap_cards_db][error] $*" >&2
  exit 1
}

log "checking cards_db existence"
if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  log "cards_db already exists"
else
  log "creating cards_db"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres < infra/postgres/initdb/016-create-cards-db.sql \
    || die "failed to create cards_db"
fi

log "applying cards foundation schema"
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < infra/postgres/initdb/017-stage5a-cards-foundation.sql \
  || die "failed to apply 017-stage5a-cards-foundation.sql"

if [ -f infra/postgres/initdb/018-stage5b-card-authorizations.sql ]; then
  log "applying stage 5B card authorizations schema"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < infra/postgres/initdb/018-stage5b-card-authorizations.sql \
    || die "failed to apply 018-stage5b-card-authorizations.sql"
fi

if [ -f infra/postgres/initdb/020-stage5c-card-authorizations-hold-link.sql ]; then
  log "applying stage 5C card authorization hold link schema"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < infra/postgres/initdb/020-stage5c-card-authorizations-hold-link.sql \
    || die "failed to apply 020-stage5c-card-authorizations-hold-link.sql"
fi

log "cards_db ready"