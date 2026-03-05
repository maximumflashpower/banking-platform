#!/usr/bin/env sh
set -eu

DATE="$(date +%F)"
BACKUP_DIR="$HOME/backups/banking-platform"
KEEP="${KEEP_LAST:-2}"

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

log "== banking-platform backup =="
log "Date: $DATE"
log "Backup dir: $BACKUP_DIR"
log "Keep last: $KEEP"

mkdir -p "$BACKUP_DIR"

# Basic checks
command -v tar >/dev/null 2>&1 || die "tar not found"
command -v gzip >/dev/null 2>&1 || die "gzip not found"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum not found"
command -v docker >/dev/null 2>&1 || die "docker not found"

docker ps >/dev/null 2>&1 || die "docker not running or not accessible"
docker inspect banking_postgres >/dev/null 2>&1 || die "container banking_postgres not found"

# Ensure pg_dump exists in the postgres container
docker exec banking_postgres sh -lc 'command -v pg_dump >/dev/null 2>&1' \
  || die "pg_dump not found inside banking_postgres"

PROJECT_TGZ="$BACKUP_DIR/project_${DATE}.tar.gz"
IDENTITY_GZ="$BACKUP_DIR/identity_${DATE}.sql.gz"
FINANCIAL_GZ="$BACKUP_DIR/financial_${DATE}.sql.gz"

log "--> Backing up project to: $PROJECT_TGZ"
tar -czf "$PROJECT_TGZ" "$HOME/projects/banking-platform" >/dev/null 2>&1 || die "project tar failed"

log "--> Backing up identity DB to: $IDENTITY_GZ"
# Use -c in gzip so we can redirect safely
docker exec banking_postgres sh -lc 'pg_dump -U app identity' | gzip -c > "$IDENTITY_GZ" || die "identity pg_dump failed"

log "--> Backing up financial DB to: $FINANCIAL_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app financial_db' | gzip -c > "$FINANCIAL_GZ" || die "financial pg_dump failed"

# Rotation helper (keeps newest N by mtime via ls -t)
rotate() {
  pattern="$1"
  keep="$2"
  # shellcheck disable=SC2086
  files=$(ls -t $pattern 2>/dev/null || true)
  [ -n "$files" ] || return 0
  # Delete from 3rd onward if keep=2, etc.
  echo "$files" | awk -v k="$keep" 'NR>k {print $0}' | while IFS= read -r f; do
    [ -n "$f" ] || continue
    log "    - removing old: $f"
    rm -f -- "$f"
  done
}

log "--> Rotating old backups (keeping last $KEEP)..."
rotate "$BACKUP_DIR/project_*.tar.gz" "$KEEP"
rotate "$BACKUP_DIR/identity_*.sql.gz" "$KEEP"
rotate "$BACKUP_DIR/financial_*.sql.gz" "$KEEP"

log "--> Generating checksums (only current rotated set)..."
(
  cd "$BACKUP_DIR"
  # Only include our managed backups (avoid hashing unrelated files)
  ls -1 project_*.tar.gz identity_*.sql.gz financial_*.sql.gz 2>/dev/null \
    | xargs -r sha256sum
) > "$BACKUP_DIR/SHA256SUMS.txt"

log "== Done =="
log "Current files:"
ls -lah "$BACKUP_DIR"
