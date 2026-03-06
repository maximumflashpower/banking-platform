#!/usr/bin/env sh
set -eu

# ===========================
# Config (override via env)
# ===========================
DATE="$(date +%F)"
BACKUP_DIR="$HOME/backups/banking-platform"
TRASH_DIR="$BACKUP_DIR/_trash/$DATE"

# Keep only the last N backups per family (default 2)
KEEP="${KEEP_LAST:-2}"

# Trash retention in days (default 15). Use TRASH_DAYS=7 for 7-day retention.
TRASH_DAYS="${TRASH_DAYS:-15}"

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

mkdir -p "$BACKUP_DIR" "$TRASH_DIR"

# ===========================
# Sanity checks
# ===========================
command -v tar >/dev/null 2>&1 || die "tar not found"
command -v gzip >/dev/null 2>&1 || die "gzip not found"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum not found"
command -v docker >/dev/null 2>&1 || die "docker not found"
command -v find >/dev/null 2>&1 || die "find not found"
command -v sort >/dev/null 2>&1 || die "sort not found"
command -v awk >/dev/null 2>&1 || die "awk not found"

docker ps >/dev/null 2>&1 || die "docker not running or not accessible"
docker inspect banking_postgres >/dev/null 2>&1 || die "container banking_postgres not found"
docker exec banking_postgres sh -lc 'command -v pg_dump >/dev/null 2>&1' \
  || die "pg_dump not found inside banking_postgres"

log "== banking-platform backup (WSL-safe rotation) =="
log "Date:       $DATE"
log "Backup dir: $BACKUP_DIR"
log "Trash dir:  $TRASH_DIR"
log "Keep last:  $KEEP"
log "Trash days: $TRASH_DAYS"

# ===========================
# 1) Create new backups
# ===========================
PROJECT_TGZ="$BACKUP_DIR/project_${DATE}.tar.gz"
IDENTITY_GZ="$BACKUP_DIR/identity_${DATE}.sql.gz"
FINANCIAL_GZ="$BACKUP_DIR/financial_${DATE}.sql.gz"

log "--> Backing up project: $PROJECT_TGZ"
tar -czf "$PROJECT_TGZ" "$HOME/projects/banking-platform" >/dev/null 2>&1 || die "project tar failed"

log "--> Backing up identity DB: $IDENTITY_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app identity' | gzip -c > "$IDENTITY_GZ" \
  || die "identity pg_dump failed"

log "--> Backing up financial DB: $FINANCIAL_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app financial_db' | gzip -c > "$FINANCIAL_GZ" \
  || die "financial pg_dump failed"

# ===========================
# 2) Normalize old backups:
#    compress *.sql -> *.sql.gz
# ===========================
log "--> Normalizing old backups (compressing .sql -> .sql.gz when found)..."

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.sql' -o -name '*_stage2_*.sql' \) -print 2>/dev/null \
| while IFS= read -r f; do
  [ -f "$f" ] || continue

  if [ -f "${f}.gz" ]; then
    log "    - moving duplicate uncompressed to trash: $(basename "$f") (gz exists)"
    mv -f -- "$f" "$TRASH_DIR/" || true
    continue
  fi

  log "    - compressing: $(basename "$f") -> $(basename "$f").gz"
  gzip -f -- "$f"
done

# ===========================
# 3) Rotation helper:
#    keep newest N (by mtime) and move the rest to trash
# ===========================
rotate_to_trash() {
  pattern="$1"
  keep="$2"

  find "$BACKUP_DIR" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' 2>/dev/null \
  | sort -nr \
  | awk -v k="$keep" 'NR>k { sub(/^[^ ]+ /, "", $0); print $0 }' \
  | while IFS= read -r f; do
      [ -n "$f" ] || continue
      [ -f "$f" ] || continue
      base="$(basename "$f")"
      log "    - moving old -> trash: $base"
      mv -f -- "$f" "$TRASH_DIR/$base" || true
    done
}

log "--> Rotating backups (keeping last $KEEP per family; moving old to trash)..."

# project families
rotate_to_trash 'project_*.tar.gz' "$KEEP"
rotate_to_trash 'project_stage2_clean_*.tar.gz' "$KEEP"

# identity families
rotate_to_trash 'identity_*.sql.gz' "$KEEP"
rotate_to_trash 'identity_stage2_*.sql.gz' "$KEEP"
rotate_to_trash 'identity_stage2_*.sql' "$KEEP"

# financial families
rotate_to_trash 'financial_*.sql.gz' "$KEEP"
rotate_to_trash 'financial_stage2_*.sql.gz' "$KEEP"
rotate_to_trash 'financial_stage2_*.sql' "$KEEP"

# ===========================
# 4) Checksums for active backups only
# ===========================
log "--> Generating SHA256SUMS.txt for active backups..."

: > "$BACKUP_DIR/SHA256SUMS.txt"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'project_*.tar.gz' \
  -o -name 'project_stage2_clean_*.tar.gz' \
  -o -name 'identity_*.sql.gz' \
  -o -name 'identity_stage2_*.sql.gz' \
  -o -name 'financial_*.sql.gz' \
  -o -name 'financial_stage2_*.sql.gz' \) \
  ! -name 'SHA256SUMS.txt' \
  -print 2>/dev/null \
| sort \
| while IFS= read -r f; do
    sha256sum "$f" >> "$BACKUP_DIR/SHA256SUMS.txt"
  done

# ===========================
# 5) Trash retention cleanup
# ===========================
log "--> Cleaning trash older than $TRASH_DAYS days..."
if [ -d "$BACKUP_DIR/_trash" ]; then
  find "$BACKUP_DIR/_trash" -mindepth 1 -maxdepth 1 -type d -mtime +"$TRASH_DAYS" -print 2>/dev/null \
  | while IFS= read -r d; do
      log "    - removing old trash folder: $d"
      rm -rf -- "$d" || true
    done
fi

log "== Done =="
log "Active backups:"
ls -lah "$BACKUP_DIR" 2>/dev/null | sed '/\/_trash/d' || true
log "Trash today:"
ls -lah "$TRASH_DIR" 2>/dev/null || true