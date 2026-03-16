# STAGE 0 — PLATFORM REFOUNDATION
# Execution Plan

Estado: planned
Objetivo: preparar la base del producto visible sin romper la infraestructura ya endurecida en Stage 7/8.

---

## 1. Propósito

Stage 0 existe para construir la base del producto final de forma segura.

No agrega toda la funcionalidad final.
No reemplaza Stage 7/8.
No rediseña el core financiero.

Su objetivo es introducir la capa de experiencia del producto con separación estricta entre:

- social / chat
- personal finance
- business finance
- financial inbox
- health y degradación por dominio

---

## 2. Restricciones no negociables

Mantener siempre:

- audit trail intacto
- backup tooling intacto
- smoke tests existentes funcionando
- access control intacto
- runbooks intactos
- payment intent como entrada financiera
- chat sin acceso directo a ledger
- fail-safe, nunca fail-open

---

## 3. Resultado esperado de Stage 0

Al final de Stage 0 debe existir:

1. shell visible del producto
2. separación clara de módulos
3. separación personal / business
4. capability switches por dominio de producto
5. health segmentado
6. bridge seguro entre chat UX y payment intent
7. pruebas que demuestren aislamiento de fallos

---

## 4. Subetapas

### 0A — PRODUCT SHELL
- navegación base
- módulos visibles
- layout consistente

### 0B — SPACE ISOLATION
- indicador persistente del espacio activo
- step-up al cambiar
- invalidación contextual

### 0C — CAPABILITY SWITCHES
- SOCIAL_CHAT_ENABLED
- PERSONAL_BANKING_ENABLED
- BUSINESS_BANKING_ENABLED
- FINANCIAL_INBOX_ENABLED

### 0D — SEGMENTED HEALTH
- identity
- social
- personal_finance
- business_finance
- risk
- ledger
- financial_inbox

### 0E — CHAT TO PAYMENT-INTENT BRIDGE
- CTA en chat
- creación segura de payment_intent
- render de estado desde chat
- sin lógica financiera crítica en social

---

## 5. Archivos probables a tocar

- services/gateway-api/src/index.js
- services/gateway-api/src/routes/
- services/gateway-api/src/middleware/
- services/gateway-api/src/services/
- services/gateway-api/src/services/resilience/domainHealth.js
- services/gateway-api/src/services/resilience/productCapabilitySwitches.js
- services/gateway-api/src/routes/public/v1/chat/
- services/gateway-api/src/routes/public/v1/personal/
- services/gateway-api/src/routes/public/v1/business/
- services/gateway-api/src/routes/public/v1/inbox/
- docs/architecture/stage0-product-shell-space-isolation.md
- scripts/stage0_smoke_test.sh

---

## 6. Variables de entorno nuevas

SOCIAL_CHAT_ENABLED=true
PERSONAL_BANKING_ENABLED=true
BUSINESS_BANKING_ENABLED=true
FINANCIAL_INBOX_ENABLED=true

Mantener:
RAILS_ACH_ENABLED=true
RAILS_CARDS_ENABLED=true

---

## 7. Pruebas obligatorias antes de empezar

### Estado repo
git status
git log --oneline -10
git tag | tail

### Docker
docker compose ps
docker compose config --services

### Bases
docker compose exec -T db psql -U app -lqt

### Audit chain
python3 - <<'PY'
import json, urllib.request
data = json.load(urllib.request.urlopen("http://localhost:3000/internal/v1/audit/evidence?limit=100"))
print("chain_verified =", data.get("chain_verified"))
print(sorted({item.get("event_type") for item in data.get("items", [])}))
PY

### Smoke tests base
bash scripts/stage7c_smoke_test.sh
bash scripts/stage7d_smoke_test.sh
bash scripts/stage8b_audit_smoke_test.sh

---

## 8. Backup obligatorio antes de cambios

export BACKUP_ENCRYPTION_KEY='CAMBIAR_POR_CLAVE_SEGURA'
POSTGRES_SERVICE=db POSTGRES_USER=app bash scripts/backup_stage8e.sh

Verificar:
cd ~/backups/banking-platform/stage8e
ls -lh
latest_sha="$(ls -1t *.artifact.sha256 | head -n1)"
sha256sum -c "$latest_sha"

---

## 9. Orden de ejecución recomendado

1. crear rama nueva
2. implementar 0C y 0D primero
3. implementar 0B
4. implementar 0A
5. implementar 0E
6. agregar scripts/stage0_smoke_test.sh
7. correr pruebas

---

## 10. Commit sugerido

feat(stage0): platform foundation for product experience

---

## 11. PR sugerido

Title:
feat(stage0): platform foundation for product experience

Description:
- product capability switches
- segmented domain health
- space isolation groundwork
- product shell groundwork
- safe chat-to-payment-intent bridge foundation
- stage0 smoke coverage
