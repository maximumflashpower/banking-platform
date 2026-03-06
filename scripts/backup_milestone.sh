#!/usr/bin/env sh
set -eu

MILESTONE="${1:-}"
[ -n "$MILESTONE" ] || { echo "Usage: $0 <milestone-tag>"; exit 1; }

DATE="$(date +%F)"
ROOT="$HOME/projects"
REPO="banking-platform"
OUTDIR="$HOME/backups/banking-platform/milestones"

mkdir -p "$OUTDIR"

# backup working tree actual
tar -czf "$OUTDIR/${MILESTONE}_${DATE}.tar.gz" -C "$ROOT" "$REPO"

echo "OK: $OUTDIR/${MILESTONE}_${DATE}.tar.gz"
ls -lh "$OUTDIR/${MILESTONE}_${DATE}.tar.gz"
