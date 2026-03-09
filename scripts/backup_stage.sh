#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/projects/banking-platform}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/banking-platform}"
DATE="$(date +%F)"
KEEP="${KEEP:-7}"

PROJECT_ARCHIVE="$BACKUP_DIR/project_${DATE}.tar.gz"
IDENTITY_GZ="$BACKUP_DIR/identity_${DATE}.sql.gz"
FINANCIAL_GZ="$BACKUP_DIR/financial_${DATE}.sql.gz"
CARDS_GZ="$BACKUP_DIR/cards_${DATE}.sql.gz"
CHECKSUM_FILE="$BACKUP_DIR/SHA256SUMS.txt"

log() {
  echo "[backup_stage] $*"
}

die() {
  echo "[backup_stage][error] $*" >&2
  exit 1
}

rotate_to_trash() {
  local pattern="$1"
  local keep="$2"

  mapfile -t files < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$pattern" | sort)
  local total="${#files[@]}"

  if [ "$total" -le "$keep" ]; then
    return 0
  fi

  local remove_count=$((total - keep))
  for ((i = 0; i < remove_count; i++)); do
    rm -f "${files[$i]}"
  done
}

[ -d "$PROJECT_DIR" ] || die "project directory not found: $PROJECT_DIR"

mkdir -p "$BACKUP_DIR"

log "project dir: $PROJECT_DIR"
log "backup dir: $BACKUP_DIR"

log "--> Backing up project files: $PROJECT_ARCHIVE"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='coverage' \
  --exclude='.DS_Store' \
  -czf "$PROJECT_ARCHIVE" \
  -C "$(dirname "$PROJECT_DIR")" \
  "$(basename "$PROJECT_DIR")" \
  || die "project tar backup failed"

log "--> Backing up identity DB: $IDENTITY_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app identity' | gzip -c > "$IDENTITY_GZ" \
  || die "identity pg_dump failed"

log "--> Backing up financial DB: $FINANCIAL_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app financial_db' | gzip -c > "$FINANCIAL_GZ" \
  || die "financial pg_dump failed"

log "--> Backing up cards DB: $CARDS_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app cards_db' | gzip -c > "$CARDS_GZ" \
  || die "cards pg_dump failed"

log "--> Rotating old backups (keep=$KEEP)"
rotate_to_trash 'project_*.tar.gz' "$KEEP"
rotate_to_trash 'identity_*.sql.gz' "$KEEP"
rotate_to_trash 'financial_*.sql.gz' "$KEEP"
rotate_to_trash 'cards_*.sql.gz' "$KEEP"

log "--> Rebuilding checksum file: $CHECKSUM_FILE"
: > "$CHECKSUM_FILE"

find "$BACKUP_DIR" -maxdepth 1 -type f \( \
  -name 'project_*.tar.gz' -o \
  -name 'identity_*.sql.gz' -o \
  -name 'financial_*.sql.gz' -o \
  -name 'cards_*.sql.gz' \
\) -print0 \
| sort -z \
| while IFS= read -r -d '' file; do
    sha256sum "$file" >> "$CHECKSUM_FILE"
  done

log "stage backup completed successfully"
log "artifacts:"
log "  - $PROJECT_ARCHIVE"
log "  - $IDENTITY_GZ"
log "  - $FINANCIAL_GZ"
log "  - $CARDS_GZ"
log "  - $CHECKSUM_FILE"