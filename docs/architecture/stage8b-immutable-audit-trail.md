# Stage 8B — Immutable audit trail

Stage 8B agrega trazabilidad append-only para eventos críticos en `gateway-api`.

## Cobertura
- approvals
- step-up
- space switch
- risk decisions
- risk/admin actions

## Mecanismo
- tabla `audit_log_immutable`
- cadena hash por registro (`previous_hash` + `entry_hash`)
- bloqueo de `UPDATE` y `DELETE`
- endpoint de evidencia: `GET /internal/v1/audit/evidence`
