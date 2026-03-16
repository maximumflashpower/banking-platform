#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/banking-platform/stage8e}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-app}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

REQUIRED_DBS=(identity financial_db cards_db risk_db case_db social)
OPTIONAL_DBS=()

if [[ -z "$BACKUP_ENCRYPTION_KEY" ]]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY is required for Stage 8E encrypted backups." >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"

timestamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
safe_ts="$(date -u +%Y-%m-%d_%H%M%S)"
branch="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)"
commit="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
short_commit="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

set_id="stage8e_${safe_ts}_${short_commit}"
set_dir="$workdir/$set_id"
mkdir -p "$set_dir/dumps"

dump_db() {
  local db="$1"
  local outfile="$2"

  echo "==> Dumping database: $db"
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
    pg_dump -U "$POSTGRES_USER" -d "$db" --no-owner --no-privileges \
    > "$outfile"
}

dump_optional_db() {
  local db="$1"
  local outfile="$2"

  echo "==> Trying optional database: $db"
  if docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$POSTGRES_SERVICE" \
    pg_dump -U "$POSTGRES_USER" -d "$db" --no-owner --no-privileges \
    > "$outfile"; then
    echo "Optional database backed up: $db"
  else
    echo "Optional database skipped: $db"
    rm -f "$outfile"
  fi
}

for db in "${REQUIRED_DBS[@]}"; do
  dump_db "$db" "$set_dir/dumps/${db}.sql"
done

for db in "${OPTIONAL_DBS[@]}"; do
  dump_optional_db "$db" "$set_dir/dumps/${db}.sql"
done

snapshot_rel="logs/system-snapshots/system_snapshot_2026-03-15_180735.log"
snapshot_file=""
if [[ -f "$PROJECT_ROOT/$snapshot_rel" ]]; then
  cp "$PROJECT_ROOT/$snapshot_rel" "$set_dir/"
  snapshot_file="$(basename "$snapshot_rel")"
fi

cat > "$set_dir/manifest.json" <<JSON
{
  "backup_set_id": "$set_id",
  "created_at_utc": "$timestamp",
  "project": "banking-platform",
  "stage": "8E",
  "branch": "$branch",
  "commit": "$commit",
  "postgres_service": "$POSTGRES_SERVICE",
  "postgres_user": "$POSTGRES_USER",
  "required_databases": ["identity", "financial_db", "cards_db", "risk_db", "case_db", "social"],
  "optional_databases": [],
  "snapshot_file": "$snapshot_file",
  "encryption": "openssl-aes-256-cbc-pbkdf2"
}
JSON

(
  cd "$set_dir"
  sha256sum manifest.json dumps/*.sql > SHA256SUMS.txt
)

archive_plain="$BACKUP_ROOT/${set_id}.tar.gz"
archive_encrypted="$BACKUP_ROOT/${set_id}.tar.gz.enc"

tar -C "$workdir" -czf "$archive_plain" "$set_id"

openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in "$archive_plain" \
  -out "$archive_encrypted" \
  -pass env:BACKUP_ENCRYPTION_KEY

rm -f "$archive_plain"

(
  cd "$BACKUP_ROOT"
  sha256sum "$(basename "$archive_encrypted")" > "${set_id}.artifact.sha256"
)

cat <<OUT
Stage 8E backup complete
backup_set_id: $set_id
artifact: $archive_encrypted
artifact_sha256: $BACKUP_ROOT/${set_id}.artifact.sha256
OUT
