#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-banking_postgres}"
DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-cards_db}"

echo "==> checking cards_db existence"
if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  echo "==> cards_db already exists"
else
  echo "==> creating cards_db"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres < infra/postgres/initdb/016-create-cards-db.sql
fi

echo "==> applying cards foundation schema"
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < infra/postgres/initdb/017-stage5a-cards-foundation.sql

echo "==> cards_db ready"