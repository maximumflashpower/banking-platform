#!/bin/bash

set -e

DATE=$(date +%F)
BACKUP_DIR="$HOME/backups/banking-platform"

echo "Creating backup directory if it doesn't exist..."
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

echo "Backup completed successfully."

echo "Files created:"
ls -lh "$BACKUP_DIR"
