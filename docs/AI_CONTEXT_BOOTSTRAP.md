# AI ENGINEERING BOOTSTRAP — banking-platform

Continuamos desarrollo del proyecto **banking-platform**.

## Proyecto

Repo:
https://github.com/maximumflashpower/banking-platform

Directorio local:
/home/ubuntu-777/projects/banking-platform

Directorio de backups:
/home/ubuntu-777/backups/banking-platform

## Stack

- Node.js v20
- PostgreSQL
- Docker Compose
- Ubuntu

## Git actual

- Branch: main
- Commit: 648f882

## Servicios Docker detectados

- db
- api

## Servicio PostgreSQL esperado

- Servicio: db
- Usuario: app

## Bases de datos detectadas

- No disponible

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
latest_backup=$(ls -1t ~/backups/banking-platform/stage8e/*.tar.gz.enc | head -n1)
POSTGRES_SERVICE=db POSTGRES_USER=app bash scripts/restore_stage8e_verify.sh "$latest_backup"

## Health actual detectado

{"ok":true,"service":"gateway-api","timestamp":"2026-03-16T01:37:45.944Z","request_id":"dfc80773-a92d-457e-b498-9f968a75b477","correlation_id":"dfc80773-a92d-457e-b498-9f968a75b477","rails":{"ach_enabled":false,"cards_enabled":true}}

## Objetivo del nuevo chat

Continuar desarrollo del proyecto banking-platform sin reconstruir arquitectura, comandos ni estado del repo.
