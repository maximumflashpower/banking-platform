#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_URL="https://github.com/maximumflashpower/banking-platform"
PROJECT_DIR="$HOME/projects/banking-platform"
BACKUP_DIR="$HOME/backups/banking-platform"

branch="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
commit="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"

docker_services="$(docker compose -f "$PROJECT_ROOT/docker-compose.yml" config --services 2>/dev/null || true)"
docker_ps="$(docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps --format json 2>/dev/null || true)"

postgres_user="app"
postgres_service="db"

db_list="$(
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T "$postgres_service" \
    psql -U "$postgres_user" -Atqc "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;" \
    2>/dev/null || true
)"

health_status="$(
  curl -fsS http://localhost:3000/health 2>/dev/null || true
)"

cat <<OUT
# AI ENGINEERING BOOTSTRAP — banking-platform

Continuamos desarrollo del proyecto **banking-platform**.

## Proyecto

Repo:
$REPO_URL

Directorio local:
$PROJECT_DIR

Directorio de backups:
$BACKUP_DIR

## Stack

- Node.js v20
- PostgreSQL
- Docker Compose
- Ubuntu

## Git actual

- Branch: $branch
- Commit: $commit

## Servicios Docker detectados

$(if [[ -n "$docker_services" ]]; then echo "$docker_services" | sed 's/^/- /'; else echo "- No disponible"; fi)

## Servicio PostgreSQL esperado

- Servicio: $postgres_service
- Usuario: $postgres_user

## Bases de datos detectadas

$(if [[ -n "$db_list" ]]; then echo "$db_list" | sed 's/^/- /'; else echo "- No disponible"; fi)

## Estado funcional conocido

Completado:
- Stage 7C — Approvals / step-up workflow
- Stage 7D — Secure web sessions
- Stage 8A — Observability foundation
- Stage 8B — Immutable audit trail
- Stage 8C — Passive resilience
- Stage 8D — Rail kill switches

Implementado pero diferido:
- Stage 8E — Backups y recovery verificable

Pendiente:
- Stage 8F — Runbooks operativos
- Stage 8G — Access control interno
- Stage 8H — Escalabilidad / performance

Milestone actual:
- v0.8.0-core-stable

## Smoke tests disponibles

- scripts/stage7c_smoke_test.sh
- scripts/stage7d_smoke_test.sh
- scripts/stage8b_audit_smoke_test.sh
- scripts/stage8d_kill_switches_smoke_test.sh

## Verificación de evidencia

Comando:
python3 - <<'PY'
import json, urllib.request
data = json.load(urllib.request.urlopen("http://localhost:3000/internal/v1/audit/evidence?limit=100"))
print("chain_verified =", data.get("chain_verified"))
print(sorted({item.get("event_type") for item in data.get("items", [])}))
PY

## Backups Stage 8E

Scripts:
- scripts/backup_stage8e.sh
- scripts/restore_stage8e_verify.sh

Comando backup:
export BACKUP_ENCRYPTION_KEY='CLAVE_SEGURA'
POSTGRES_SERVICE=db POSTGRES_USER=app bash scripts/backup_stage8e.sh

Comando restore verify:
export BACKUP_ENCRYPTION_KEY='MISMA_CLAVE_DEL_BACKUP'
latest_backup=\$(ls -1t ~/backups/banking-platform/stage8e/*.tar.gz.enc | head -n1)
POSTGRES_SERVICE=db POSTGRES_USER=app bash scripts/restore_stage8e_verify.sh "\$latest_backup"

## Health actual detectado

$(if [[ -n "$health_status" ]]; then echo "$health_status"; else echo "No disponible"; fi)

## Objetivo del nuevo chat

Continuar desarrollo del proyecto banking-platform sin reconstruir arquitectura, comandos ni estado del repo.
OUT
