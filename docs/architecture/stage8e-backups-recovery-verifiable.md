# Stage 8E — Backups y recovery verificable

## Objetivo
Formalizar backups y recovery verificable sin afectar la estabilidad del gateway ni el audit trail inmutable.

## Alcance
Backups cifrados por set para:
- identity
- financial
- cards
- risk
- case
- audit

Opcional recomendado:
- social

## Principios
- Sin tocar rutas críticas del gateway
- Sin romper smoke tests existentes
- Restore siempre en bases scratch de verificación
- Evidencia obligatoria por restore test

## Artefacto generado
Cada backup set incluye:
- dumps SQL por base
- manifest.json
- SHA256SUMS.txt
- snapshot operativo de referencia
- artefacto final cifrado

## Verificación de restore
El restore test:
1. descifra artefacto
2. valida checksums
3. restaura en bases temporales
4. valida tablas críticas
5. valida consistencia básica del ledger
6. genera evidencia en logs/recovery-evidence/

## Riesgo
Bajo, porque opera fuera de la ruta crítica y no modifica la lógica transaccional del gateway.
