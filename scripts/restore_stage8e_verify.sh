#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-app}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
RECOVERY_EVIDENCE_DIR="$PROJECT_ROOT/logs/recovery-evidence"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/restore_stage8e_verify.sh /path/to/backup.tar.gz.enc" >&2
  exit 1
fi

if [[ -z "$BACKUP_ENCRYPTION_KEY" ]]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY is required." >&2
  exit 1
fi

artifact="$1"
mkdir -p "$RECOVERY_EVIDENCE_DIR"

ts="$(date -u +%Y-%m-%dT%H%M%SZ)"
safe_ts="$(date -u +%Y-%m-%d_%H%M%S)"
db_suffix="$(date -u +%Y%m%d%H%M%S)"
log_file="$RECOVERY_EVIDENCE_DIR/recovery_verify_${safe_ts}.log"
json_file="$RECOVERY_EVIDENCE_DIR/recovery_verify_${safe_ts}.json"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

exec > >(tee -a "$log_file") 2>&1

echo "==> Stage 8E restore verification started at $ts"
echo "==> Artifact: $artifact"

plain_archive="$workdir/backup.tar.gz"
extract_dir="$workdir/extracted"

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$artifact" \
  -out "$plain_archive" \
  -pass env:BACKUP_ENCRYPTION_KEY

mkdir -p "$extract_dir"
tar -C "$extract_dir" -xzf "$plain_archive"

backup_dir="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n1)"
if [[ -z "$backup_dir" ]]; then
  echo "ERROR: Could not find extracted backup directory." >&2
  exit 1
fi

echo "==> Validating internal checksums"
(
  cd "$backup_dir"
  sha256sum -c SHA256SUMS.txt
)

restore_db() {
  local source_db="$1"
  local dump_file="$2"
  local target_db="${source_db}_restore_verify_${db_suffix}"

  echo "==> Restoring $source_db into $target_db" >&2

  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$target_db\";" >&2

  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"$target_db\";" >&2

  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$target_db" -v ON_ERROR_STOP=1 \
    < "$dump_file" >&2

  printf '%s\n' "$target_db"
}

verify_table_exists() {
  local db="$1"
  local table="$2"

  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$db" -Atqc \
    "SELECT to_regclass('public.${table}') IS NOT NULL;"
}

verify_required_tables() {
  local db="$1"
  shift
  local failures=0

  for table in "$@"; do
    local exists
    exists="$(verify_table_exists "$db" "$table")"
    echo "Table check [$db.$table] => $exists"
    if [[ "$exists" != "t" ]]; then
      failures=1
    fi
  done

  return "$failures"
}

verify_ledger_consistency() {
  local db="$1"

  local has_postings
  has_postings="$(verify_table_exists "$db" "ledger_postings")"
  local has_journal
  has_journal="$(verify_table_exists "$db" "ledger_journal_entries")"

  if [[ "$has_postings" != "t" || "$has_journal" != "t" ]]; then
    echo "Ledger consistency check => FAIL (required tables missing)"
    return 1
  fi

  local has_column
  has_column="$(
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
      psql -U "$POSTGRES_USER" -d "$db" -Atqc \
      "SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema='public'
           AND table_name='ledger_postings'
           AND column_name='journal_entry_id'
       );"
  )"

  if [[ "$has_column" != "t" ]]; then
    echo "Ledger consistency check => FAIL (journal_entry_id missing)"
    return 1
  fi

  local orphan_count
  orphan_count="$(
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
      psql -U "$POSTGRES_USER" -d "$db" -Atqc \
      "SELECT COUNT(*)
         FROM ledger_postings lp
         LEFT JOIN ledger_journal_entries je
           ON je.id = lp.journal_entry_id
        WHERE je.id IS NULL;"
  )"

  echo "Ledger orphan postings count => $orphan_count"

  if [[ "$orphan_count" != "0" ]]; then
    echo "Ledger consistency check => FAIL"
    return 1
  fi

  echo "Ledger consistency check => PASS"
  return 0
}

declare -A restored
required=(identity financial_db cards_db risk_db case_db social)

for db in "${required[@]}"; do
  dump_file="$backup_dir/dumps/${db}.sql"
  if [[ ! -f "$dump_file" ]]; then
    echo "ERROR: Missing dump for required db: $db" >&2
    exit 1
  fi
  restored["$db"]="$(restore_db "$db" "$dump_file")"
done

overall_status="PASS"

verify_required_tables "${restored[identity]}" \
  users sessions step_up_sessions audit_log_immutable || overall_status="FAIL"

verify_required_tables "${restored[financial_db]}" \
  payment_intents ledger_accounts ledger_journal_entries ledger_postings || overall_status="FAIL"

verify_required_tables "${restored[cards_db]}" \
  cards card_authorizations cards_webhook_events || overall_status="FAIL"

verify_required_tables "${restored[risk_db]}" \
  risk_decisions risk_profiles || overall_status="FAIL"

verify_required_tables "${restored[case_db]}" \
  cases case_timeline case_assignments || overall_status="FAIL"

verify_required_tables "${restored[social]}" \
  entitlements role_change_events || overall_status="FAIL"

verify_ledger_consistency "${restored[financial_db]}" || overall_status="FAIL"

IDENTITY_DB="${restored[identity]}"
FINANCIAL_DB="${restored[financial_db]}"
CARDS_DB="${restored[cards_db]}"
RISK_DB="${restored[risk_db]}"
CASE_DB="${restored[case_db]}"
SOCIAL_DB="${restored[social]}"
OVERALL_STATUS="$overall_status"
TS="$ts"
ARTIFACT="$artifact"
LOG_FILE="$log_file"
BACKUP_DIR_JSON="$backup_dir"

IDENTITY_DB="$IDENTITY_DB" \
FINANCIAL_DB="$FINANCIAL_DB" \
CARDS_DB="$CARDS_DB" \
RISK_DB="$RISK_DB" \
CASE_DB="$CASE_DB" \
SOCIAL_DB="$SOCIAL_DB" \
OVERALL_STATUS="$OVERALL_STATUS" \
TS="$TS" \
ARTIFACT="$ARTIFACT" \
LOG_FILE="$LOG_FILE" \
BACKUP_DIR_JSON="$BACKUP_DIR_JSON" \
python3 - <<'PY' > "$json_file"
import json
import os
from pathlib import Path

manifest = json.loads(Path(os.environ["BACKUP_DIR_JSON"]).joinpath("manifest.json").read_text())

data = {
  "verified_at_utc": os.environ["TS"],
  "artifact": os.environ["ARTIFACT"],
  "backup_set_id": manifest.get("backup_set_id"),
  "branch": manifest.get("branch"),
  "commit": manifest.get("commit"),
  "restored_databases": {
    "identity": os.environ["IDENTITY_DB"],
    "financial_db": os.environ["FINANCIAL_DB"],
    "cards_db": os.environ["CARDS_DB"],
    "risk_db": os.environ["RISK_DB"],
    "case_db": os.environ["CASE_DB"],
    "social": os.environ["SOCIAL_DB"],
  },
  "overall_status": os.environ["OVERALL_STATUS"],
  "log_file": os.environ["LOG_FILE"],
}
print(json.dumps(data, indent=2))
PY

echo "==> Evidence JSON: $json_file"
echo "==> Final result: $overall_status"

if [[ "$overall_status" != "PASS" ]]; then
  exit 1
fi