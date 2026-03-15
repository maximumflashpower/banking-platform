#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/projects/banking-platform}"
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_DIR/logs/system-snapshots}"
TS="$(date +%Y-%m-%d_%H%M%S)"
OUTFILE="$OUTPUT_DIR/system_snapshot_${TS}.log"

mkdir -p "$OUTPUT_DIR"

log_section() {
  local title="$1"
  {
    echo
    echo "========== ${title} =========="
  } >> "$OUTFILE"
}

run_cmd() {
  local label="$1"
  shift
  log_section "$label"
  {
    echo "+ $*"
    "$@" 2>&1
  } >> "$OUTFILE" || true
}

run_text() {
  local label="$1"
  local text="$2"
  log_section "$label"
  printf "%s\n" "$text" >> "$OUTFILE"
}

cd "$PROJECT_DIR"

{
  echo "banking-platform system snapshot"
  echo "generated_at=$(date --iso-8601=seconds)"
  echo "project_dir=$PROJECT_DIR"
  echo "output_file=$OUTFILE"
} > "$OUTFILE"

run_cmd "pwd" pwd
run_cmd "git status" git status --short --branch
run_cmd "git branch current" git branch --show-current
run_cmd "git log recent" git log --oneline --decorate --max-count=8
run_cmd "docker compose ps" docker compose ps
run_cmd "docker inspect banking_api" docker inspect banking_api --format='{{.State.Status}} restarting={{.State.Restarting}} exit_code={{.State.ExitCode}} error={{.State.Error}}'
run_cmd "docker inspect banking_postgres" docker inspect banking_postgres --format='{{.State.Status}} restarting={{.State.Restarting}} exit_code={{.State.ExitCode}} error={{.State.Error}}'
run_cmd "health" curl -fsS http://localhost:3000/health
run_cmd "api logs tail" docker compose logs --tail=120 api
run_cmd "postgres logs tail" docker compose logs --tail=80 postgres

log_section "audit evidence summary"
python3 - <<'PY' >> "$OUTFILE" 2>&1 || true
import json, urllib.request
url = "http://localhost:3000/internal/v1/audit/evidence?limit=100"
data = json.load(urllib.request.urlopen(url))
print("url =", url)
print("chain_verified =", data.get("chain_verified"))
print("count =", data.get("count"))
events = sorted({item.get("event_type") for item in data.get("items", []) if item.get("event_type")})
print("event_types =", events)
PY

log_section "backups latest files"
{
  BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/banking-platform}"
  echo "backup_dir=$BACKUP_DIR"
  if [ -d "$BACKUP_DIR" ]; then
    ls -lt "$BACKUP_DIR" | head -n 20
  else
    echo "backup directory not found"
  fi
} >> "$OUTFILE" 2>&1 || true

log_section "backup checksum verification"
{
  BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/banking-platform}"
  if [ -f "$BACKUP_DIR/SHA256SUMS.txt" ]; then
    cd "$BACKUP_DIR"
    sha256sum -c SHA256SUMS.txt
  else
    echo "SHA256SUMS.txt not found"
  fi
} >> "$OUTFILE" 2>&1 || true

run_text "snapshot result" "snapshot_saved=$OUTFILE"

echo "Snapshot creado: $OUTFILE"
