#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CONTAINER="${DB_CONTAINER:-banking_postgres}"
DB_USER="${DB_USER:-app}"
DB_PASS="${DB_PASS:-app}"
FIN_DB="${FIN_DB:-financial_db}"
SQL_DIR="${SQL_DIR:-$REPO_ROOT/datastores/financial-db}"

export PGPASSWORD="$DB_PASS"

echo "[bootstrap] container=$CONTAINER fin_db=$FIN_DB user=$DB_USER sql_dir=$SQL_DIR"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}\$"; then
  echo "[bootstrap] ERROR: container '${CONTAINER}' no está corriendo"
  exit 1
fi

if [ ! -d "$SQL_DIR" ]; then
  echo "[bootstrap] ERROR: SQL_DIR no existe: $SQL_DIR"
  exit 1
fi

echo "[bootstrap] waiting for postgres..."
for i in {1..60}; do
  if docker exec "$CONTAINER" sh -lc "pg_isready -U '$DB_USER' -d postgres >/dev/null 2>&1"; then
    break
  fi
  sleep 1
done

echo "[bootstrap] ensure database: $FIN_DB"
docker exec -i "$CONTAINER" sh -lc "
set -e
exists=\$(psql -U '$DB_USER' -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='${FIN_DB}'\")
if [ \"\$exists\" != \"1\" ]; then
  echo \"[bootstrap] creating database: ${FIN_DB}\"
  createdb -U '$DB_USER' '${FIN_DB}'
else
  echo \"[bootstrap] database exists: ${FIN_DB}\"
fi
"

echo "[bootstrap] waiting for database to accept connections..."
for i in {1..30}; do
  if docker exec "$CONTAINER" sh -lc "psql -U '$DB_USER' -d '$FIN_DB' -c 'select 1' >/dev/null 2>&1"; then
    break
  fi
  sleep 1
done

run_sql() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "[bootstrap] ERROR: missing file: $file"
    ls -la "$SQL_DIR"
    exit 1
  fi
  echo "[bootstrap] apply: $(basename "$file")"
  docker exec -i "$CONTAINER" sh -lc "psql -U '$DB_USER' -d '$FIN_DB' -v ON_ERROR_STOP=1" < "$file"
}

run_sql "$SQL_DIR/idempotency_keys.sql"
run_sql "$SQL_DIR/payment_intents.sql"
run_sql "$SQL_DIR/payment_intent_states.sql"
run_sql "$SQL_DIR/020_stage2e_ops_inbox_freeze.sql"

echo "[bootstrap] done ✅"
