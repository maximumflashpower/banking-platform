#!/usr/bin/env sh
set -eu

DATE="$(date +%F)"
BACKUP_DIR="$HOME/backups/banking-platform"
KEEP="${KEEP_LAST:-2}"

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"

# Checks mínimos
command -v tar >/dev/null 2>&1 || die "tar not found"
command -v gzip >/dev/null 2>&1 || die "gzip not found"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum not found"
command -v docker >/dev/null 2>&1 || die "docker not found"

docker ps >/dev/null 2>&1 || die "docker not running or not accessible"
docker inspect banking_postgres >/dev/null 2>&1 || die "container banking_postgres not found"
docker exec banking_postgres sh -lc 'command -v pg_dump >/dev/null 2>&1' \
  || die "pg_dump not found inside banking_postgres"

log "== banking-platform backup =="
log "Date: $DATE"
log "Backup dir: $BACKUP_DIR"
log "Keep last: $KEEP"

# ---------- 1) Crear backups nuevos (formato estándar) ----------
PROJECT_TGZ="$BACKUP_DIR/project_${DATE}.tar.gz"
IDENTITY_GZ="$BACKUP_DIR/identity_${DATE}.sql.gz"
FINANCIAL_GZ="$BACKUP_DIR/financial_${DATE}.sql.gz"

log "--> Backing up project: $PROJECT_TGZ"
tar -czf "$PROJECT_TGZ" "$HOME/projects/banking-platform" >/dev/null 2>&1 || die "project tar failed"

log "--> Backing up identity DB: $IDENTITY_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app identity' | gzip -c > "$IDENTITY_GZ" || die "identity pg_dump failed"

log "--> Backing up financial DB: $FINANCIAL_GZ"
docker exec banking_postgres sh -lc 'pg_dump -U app financial_db' | gzip -c > "$FINANCIAL_GZ" || die "financial pg_dump failed"

# ---------- 2) Comprimir SQL antiguos que estén sin .gz ----------
compress_sql_if_needed() {
  # Comprime *.sql a *.sql.gz, y borra el .sql original
  # No falla si no hay matches
  for f in "$BACKUP_DIR"/*.sql "$BACKUP_DIR"/*_stage2_*.sql 2>/dev/null; do
    [ -f "$f" ] || continue
    # Si ya existe .gz, elimina el .sql para evitar duplicados
    if [ -f "${f}.gz" ]; then
      log "    - removing duplicate uncompressed: $(basename "$f") (gz exists)"
      rm -f -- "$f"
      continue
    fi
    log "    - compressing: $(basename "$f") -> $(basename "$f").gz"
    gzip -f -- "$f"
  done
}
log "--> Normalizing old backups (compressing .sql -> .sql.gz when found)..."
compress_sql_if_needed

# ---------- 3) Rotación: mantener solo los últimos N por patrón ----------
rotate() {
  pattern="$1"
  keep="$2"

  # ls -t ordena por mtime (más reciente primero)
  # Si no hay archivos, no hace nada
  files="$(ls -t $pattern 2>/dev/null || true)"
  [ -n "$files" ] || return 0

  # Borra desde el (keep+1) en adelante
  echo "$files" | awk -v k="$keep" 'NR>k {print $0}' | while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] || continue
    log "    - removing old: $f"
    rm -f -- "$f"
  done
}

log "--> Rotating backups (keeping last $KEEP per family)..."

# Familia "project" (nuevo)
rotate "$BACKUP_DIR/project_*.tar.gz" "$KEEP"
# Familia "project_stage2_clean" (viejo)
rotate "$BACKUP_DIR/project_stage2_clean_*.tar.gz" "$KEEP"

# Identity (nuevo + viejos stage2)
rotate "$BACKUP_DIR/identity_*.sql.gz" "$KEEP"
rotate "$BACKUP_DIR/identity_stage2_*.sql.gz" "$KEEP"  # por si ya fueron comprimidos
rotate "$BACKUP_DIR/identity_stage2_*.sql" "$KEEP"     # por si quedan (raro)

# Financial (nuevo + viejos stage2)
rotate "$BACKUP_DIR/financial_*.sql.gz" "$KEEP"
rotate "$BACKUP_DIR/financial_stage2_*.sql.gz" "$KEEP"
rotate "$BACKUP_DIR/financial_stage2_*.sql" "$KEEP"

# ---------- 4) Generar checksums SOLO de archivos que controlamos ----------
log "--> Generating checksums..."
(
  cd "$BACKUP_DIR"
  # Lista solo lo relevante (si no existe alguno, lo ignora)
  ls -1 \
    project_*.tar.gz \
    project_stage2_clean_*.tar.gz \
    identity_*.sql.gz \
    identity_stage2_*.sql.gz \
    financial_*.sql.gz \
    financial_stage2_*.sql.gz \
    2>/dev/null | xargs -r sha256sum
) > "$BACKUP_DIR/SHA256SUMS.txt"

log "== Done =="
log "Current files:"
ls -lah "$BACKUP_DIR"
