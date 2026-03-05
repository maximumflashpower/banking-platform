#!/bin/bash

set -e

DATE=$(date +%F)
BACKUP_DIR="$HOME/backups/banking-platform"

echo "Creating backup directory..."
mkdir -p "$BACKUP_DIR"

echo "Backing up project..."
tar -czf "$BACKUP_DIR/project_${DATE}.tar.gz" \
"$HOME/projects/banking-platform"

echo "Backing up identity database..."
docker exec banking_postgres pg_dump -U app identity > \
"$BACKUP_DIR/identity_${DATE}.sql"

echo "Backing up financial database..."
docker exec banking_postgres pg_dump -U app financial_db > \
"$BACKUP_DIR/financial_${DATE}.sql"

echo "Generating checksums..."
sha256sum "$BACKUP_DIR"/* > "$BACKUP_DIR/SHA256SUMS.txt"

echo "Cleaning old backups (keeping last 2)..."

ls -t $BACKUP_DIR/project_*.tar.gz | tail -n +3 | xargs -r rm
ls -t $BACKUP_DIR/identity_*.sql | tail -n +3 | xargs -r rm
ls -t $BACKUP_DIR/financial_*.sql | tail -n +3 | xargs -r rm

echo "Backup completed."
echo "Current backups:"

ls -lh "$BACKUP_DIR"
