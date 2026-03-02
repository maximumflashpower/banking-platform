# DEPENDENCY & ENVIRONMENT POLICY (ANTI-INFECTION) — v1.1

Proyecto: banking-platform (Super App Chat + Embedded Finance)

OBJETIVO
Evitar que el proyecto se “infecte” por:
- cambios automáticos de Node / Docker images
- updates de paquetes no controlados
- lockfiles regenerados sin control
- builds/caches mezclados (host vs contenedor)
- trabajo en /mnt/c en WSL
- credenciales/token mal guardados
Este documento es la única fuente de verdad para dependencias y upgrades.

========================================================
0) PRINCIPIO MADRE (NO NEGOCIABLE)
========================================================
0.1 Docker es la fuente de verdad del runtime.
- Todas las instalaciones/ejecuciones que afecten build deben ocurrir dentro del contenedor.
- El host (Windows/WSL) se usa solo para: git, editor, docker compose, utilidades CLI.

0.2 Nunca “arreglar” un error instalando cosas al azar.
- Si algo falla, primero se documenta, luego se corrige en branch (ver Upgrade Window).

========================================================
1) FUENTE DE VERDAD DEL ENTORNO (INMUTABLE)
========================================================
1.1 Docker es la fuente de verdad.
- Se trabaja siempre con Docker Desktop + WSL Integration.
- Node del host (WSL/Windows) NO se usa para el proyecto.

1.2 Node fijo exacto:
- Node = 20.11.1 (no rangos).
- Dockerfile usa: node:20.11.1-alpine
- Prohibido: node:20, node:lts, latest, alpine sin tag exacto.

1.3 Ubicación del repo:
- Permitido: /home/<user>/projects/...
- Prohibido: /mnt/c/... (choques/corrupción/lentitud/permisos)

1.4 Versiones mínimas (recomendadas como “baseline”):
- WSL2 obligatorio
- Docker Desktop con WSL Integration activo
- docker compose v2 (comando: `docker compose`, NO `docker-compose` legado)
Nota: las versiones exactas se registran en /docs/governance/environment-baseline.md (cuando exista).

========================================================
2) GIT, CREDENCIALES Y SEGURIDAD OPERATIVA (ANTI-CAOS)
========================================================
2.1 Git es el único mecanismo de “backup estable”.
- Prohibido duplicar carpetas del repo para “respaldo”.
- Permitido: tags `vX.Y.Z-stable` y branches `release/*`.

2.2 Tokens/credenciales:
- Prohibido commitear secretos (.env real, tokens, keys).
- Obligatorio: usar `.env.example` como plantilla y documentar variables.
- Si se usa HTTPS + PAT:
  - Preferido: credential helper seguro (keychain/manager). Evitar “store” si el equipo no es personal.
- Si se usa SSH:
  - Una llave por usuario/máquina, registrada en GitHub.
  - Prohibido mezclar llaves “de terceros” sin saber su propósito.

2.3 Branch protection (cuando se habilite):
- main protegida (no pushes directos)
- PR obligatorio
- CI obligatorio antes de merge

========================================================
3) DEPENDENCIAS Y HERRAMIENTAS PERMITIDAS
========================================================
3.1 Package Manager (elegir 1):
- Permitido: npm (simple) o pnpm (mejor para monorepo)
- Prohibido mezclar: npm + yarn + pnpm en el mismo repo.

3.2 Versionado del package manager (obligatorio):
- Si npm:
  - Fijar Node y usar el npm que viene con esa imagen.
- Si pnpm:
  - Fijar versión con `packageManager` en package.json (ej: "pnpm@9.15.0")
  - Preferible usar Corepack dentro del contenedor.

3.3 Instalación obligatoria:
- npm: usar SIEMPRE `npm ci` (nunca `npm install` en CI)
- pnpm: usar SIEMPRE `pnpm install --frozen-lockfile`

3.4 Lockfile:
- Obligatorio en git.
- Prohibido commitear cambios del lockfile fuera de Upgrade Window.
- Prohibido borrar/regenerar lockfile “porque sí”.

3.5 Dependencias mínimas base (aprobadas):
- logger: pino
- validation: zod
- config: dotenv
- crypto/jwt: jose (cuando se use auth tokens)
- password hashing: argon2 (si hay passwords)

3.6 Testing base (aprobado):
- vitest (o jest) — elegir uno
- Prohibido: dos frameworks de test simultáneos.

3.7 Lint/format (aprobado):
- eslint + prettier
- husky + lint-staged (para bloquear commits rotos)

========================================================
4) PROHIBICIONES (ANTI-INFECCIÓN)
========================================================
- Prohibido instalar dependencias en el host (WSL):
  NO `npm install` / `pnpm install` fuera del contenedor
- Prohibido versionar `node_modules/`, `dist/`, `build/`, caches
- Prohibido usar tags flotantes en Docker images
- Prohibido cambiar Node + deps en el mismo PR
- Prohibido trabajar en /mnt/c con WSL para este repo

========================================================
5) UPGRADE WINDOW (ÚNICA FORMA DE ACTUALIZAR)
========================================================
5.1 Regla:
Actualizaciones solo se permiten en branch:
- upgrade/<fecha>-<motivo>

5.2 Proceso obligatorio:
1) Crear branch upgrade/*
2) Cambiar 1 cosa a la vez:
   - Node OR deps OR tooling (no combinarlas)
3) Ejecutar suite de tests completa
4) Si todo pasa -> PR -> merge
5) Si falla -> revert (no “parchear main”)

5.3 Node upgrades:
- Requiere actualizar:
  - Dockerfile (tag exacto)
  - package.json engines
  - CI checks
- No se actualiza si no hay tests mínimos.

5.4 Dependencias (deps) upgrades:
- Requiere:
  - changelog breve (qué y por qué)
  - lockfile incluido
  - tests + lint OK
  - si es monorepo: verificar instalación limpia en contenedor desde cero

========================================================
6) CI GUARDRAILS (BLOQUEO AUTOMÁTICO)
========================================================
CI debe fallar si:
- Node runtime dentro del contenedor != 20.11.1 (validar con `node -p process.version`)
- lockfile cambia sin estar en branch upgrade/*
- comandos intentan `npm install` (debe ser `npm ci`) o `pnpm install` sin frozen lockfile
- lint/test fallan
- se detecta `node_modules/` o `dist/` en commits

Sugerencias prácticas (para implementar luego):
- job “verify-node-version”
- job “verify-lockfile-discipline”
- job “lint+test”

========================================================
7) DEPENDENCIAS TRANSITIVAS Y RIESGO (RECOMENDADO)
========================================================
7.1 Regla:
Antes de agregar una dependencia nueva:
- justificar en PR (por qué no se puede con libs ya aprobadas)
- preferir libs con mantenimiento activo y baja superficie

7.2 Señales de alerta (requiere revisión):
- paquetes con cientos de dependencias transitorias
- paquetes sin releases recientes
- paquetes con “postinstall” scripts sospechosos

========================================================
8) BACKUPS / EXPORTS ESTABLES (SIN INFECCIÓN)
========================================================
Backups estables con git:
- Tags: v0.1.0-stable
- Branch release: release/v0.1
NO duplicar carpetas del repo.

Si se exporta ZIP:
- borrar node_modules, dist, build, caches antes.

========================================================
9) CHECKLIST POR ETAPA (PEGAR EN CADA CHAT)
========================================================
ETAPA 0 (bootstrap):
- Dockerfile con node:20.11.1-alpine
- `docker compose exec <svc> node -v` -> v20.11.1
- Repo en /home/... nunca /mnt/c
- lockfile en git

ETAPA 1-3 (MVP):
- No deps nuevas sin aprobación
- Solo lint/test básicos
- No upgrades fuera de upgrade/*

ETAPA 4-6 (integraciones):
- Idempotency / webhooks con verify/dedupe
- No actualizar deps durante integración rails/cards/risk

ETAPA 7-8 (hardening):
- Observabilidad aprobada
- Hardening solo via upgrade/*

========================================================
10) RESUMEN EJECUTIVO (EN 3 LÍNEAS)
========================================================
- Docker controla Node y runtime; el host no toca deps.
- Lockfile + installs congeladas; upgrades solo en upgrade/*
- Repo vive en /home/... nunca /mnt/c
FIN