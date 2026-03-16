# RUNBOOK — Backup and Recovery

## Purpose

Provide procedures for encrypted backup and restore verification.

---

## Create encrypted backup

cd ~/projects/banking-platform

export BACKUP_ENCRYPTION_KEY='CLAVE_SEGURA'

POSTGRES_SERVICE=db POSTGRES_USER=app \
bash scripts/backup_stage8e.sh

---

## Verify checksum

cd ~/backups/banking-platform/stage8e

latest_sha=$(ls -1t *.artifact.sha256 | head -n1)
sha256sum -c "$latest_sha"

---

## Restore verification

cd ~/projects/banking-platform

export BACKUP_ENCRYPTION_KEY='MISMA_CLAVE'

latest_backup=$(ls -1t ~/backups/banking-platform/stage8e/*.tar.gz.enc | head -n1)

POSTGRES_SERVICE=db POSTGRES_USER=app \
bash scripts/restore_stage8e_verify.sh "$latest_backup"
