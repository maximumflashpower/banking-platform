#!/usr/bin/env sh
set -eu

MILESTONE="${1:-}"
[ -n "$MILESTONE" ] || { echo "Usage: $0 <milestone-tag>"; exit 1; }

DATE="$(date +%F)"
ROOT="$HOME/projects"
REPO="banking-platform"
OUTDIR="$HOME/backups/banking-platform/milestones"

mkdir -p "$OUTDIR"

normalize_tag() {
  tag="$1"
  case "$tag" in
    *_"$DATE")
      printf '%s' "$tag"
      ;;
    *)
      printf '%s_%s' "$tag" "$DATE"
      ;;
  esac
}

SAFE_TAG="$(normalize_tag "$MILESTONE")"
OUTFILE="$OUTDIR/${SAFE_TAG}.tar.gz"

tar -czf "$OUTFILE" -C "$ROOT" "$REPO"

echo "OK: $OUTFILE"
ls -lh "$OUTFILE"