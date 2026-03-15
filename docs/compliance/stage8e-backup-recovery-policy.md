# Stage 8E — Backup & Recovery Policy

## Frecuencia
- 1 backup completo diario

## Retención
- 30 días

## Cifrado en reposo
- Obligatorio para artefactos Stage 8E
- Clave provista por variable de entorno
- No se commitean secretos

## Restore test
- Al menos una prueba de restore verificada en staging
- Evidencia obligatoria conservada

## Integridad
- SHA256 del contenido interno
- SHA256 del artefacto final cifrado
- Trazabilidad con manifest (branch, commit, timestamp)

## Ledger consistency
Tras restore del dominio financial:
- existencia de tablas ledger críticas
- ausencia de postings huérfanos respecto al journal
