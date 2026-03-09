#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/projects/banking-platform}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/banking-platform}"
MILESTONES_DIR="$BACKUP_ROOT/milestones"
DATE="$(date +%F)"

if [ $# -lt 1 ]; then
  echo "usage: $0 <milestone_name>"
  exit 1
fi

MILESTONE_NAME="$1"
ARCHIVE_NAME="${MILESTONE_NAME}_${DATE}.tar.gz"
ARCHIVE_PATH="$MILESTONES_DIR/$ARCHIVE_NAME"

log() {
  echo "[backup_milestone] $*"
}

die() {
  echo "[backup_milestone][error] $*" >&2
  exit 1
}

[ -d "$PROJECT_DIR" ] || die "project directory not found: $PROJECT_DIR"

mkdir -p "$MILESTONES_DIR"

log "project dir: $PROJECT_DIR"
log "milestones dir: $MILESTONES_DIR"
log "creating archive: $ARCHIVE_PATH"

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='coverage' \
  --exclude='.DS_Store' \
  -czf "$ARCHIVE_PATH" \
  -C "$(dirname "$PROJECT_DIR")" \
  "$(basename "$PROJECT_DIR")" \
  || die "failed to create milestone archive"

log "milestone backup created successfully"
log "archive: $ARCHIVE_PATH"