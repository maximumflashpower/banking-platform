# NEW CHAT MASTER CONTEXT
# BANKING CHAT PLATFORM

Este documento permite continuar el desarrollo del proyecto desde un chat nuevo sin perder contexto.

Repositorio:
https://github.com/maximumflashpower/banking-platform

Ruta local:
~/projects/banking-platform

Backups:
~/backups/banking-platform

---

# PRODUCTO

Aplicación tipo:

- WeChat
- WhatsApp
- Telegram

pero con infraestructura financiera integrada.

Funciones principales:

chat  
pagos  
wallet  
cuentas business  
financial inbox

No es red social.

No hay feed ni timeline.

La app se centra en comunicación privada + operaciones financieras.

---

# PRINCIPIOS DE ARQUITECTURA

Separación de dominios obligatoria:

identity  
social  
financial  
ledger  
risk  
aml  
governance  
ops  

Regla crítica:

chat nunca ejecuta pagos directamente.

Flujo obligatorio:

chat → payment intent → risk → ledger → confirmación

Nunca:

chat → ledger directo

Modo de seguridad:

fail-safe

Nunca:

fail-open

---

# ENTORNO

Sistema:

Ubuntu  
Docker  
Node.js v20  
PostgreSQL

Servicios docker:

api  
db

Verificar:

docker compose ps

---

# BASES DE DATOS

identity  
financial_db  
cards_db  
risk_db  
case_db  
social  

Verificar:

docker compose exec -T db psql -U app -lqt

---

# AUDIT TRAIL

Verificar evidencia:

python3 - <<'PY'
import json, urllib.request
data = json.load(
    urllib.request.urlopen(
        "http://localhost:3000/internal/v1/audit/evidence?limit=100"
    )
)

print("chain_verified =", data.get("chain_verified"))
print(sorted({item.get("event_type") for item in data.get("items", [])}))
PY

Resultado esperado:

chain_verified = True

---

# BACKUPS

Crear backup:

export BACKUP_ENCRYPTION_KEY='CAMBIAR_CLAVE'
POSTGRES_SERVICE=db POSTGRES_USER=app bash scripts/backup_stage8e.sh

Verificar:

cd ~/backups/banking-platform/stage8e
ls -lh
latest_sha="$(ls -1t *.artifact.sha256 | head -n1)"
sha256sum -c "$latest_sha"

Resultado esperado:

OK

---

# TESTS

bash scripts/stage7c_smoke_test.sh  
bash scripts/stage7d_smoke_test.sh  
bash scripts/stage8b_audit_smoke_test.sh

---

# DOCUMENTACIÓN

docs/runbooks/  
docs/access-control/  
docs/performance/

---

# MILESTONE ACTUAL

v0.9.0-ops-hardened

Incluye:

observability  
audit trail  
resiliencia  
kill switches  
backup cifrado  
runbooks  
access control  
performance validation

---

# STAGES COMPLETADAS

Stage 7C — Approvals workflow  
Stage 7D — Secure sessions  

Stage 8A — Observability  
Stage 8B — Immutable audit  
Stage 8C — Passive resilience  
Stage 8D — Kill switches  
Stage 8E — Backup & recovery  
Stage 8F — Runbooks  
Stage 8G — Access control  
Stage 8H — Performance validation  

---

# NUEVA ETAPA

Stage 0 — Platform Refoundation

Objetivo:

preparar el sistema para la experiencia completa del producto.

---

# SUBETAPAS

0A — Product shell

chats  
contacts  
wallet  
business  
settings  

---

0B — Space isolation

personal space  
business space  

---

0C — Domain kill switches

SOCIAL_ENABLED  
PERSONAL_FINANCE_ENABLED  
BUSINESS_FINANCE_ENABLED  
FINANCIAL_INBOX_ENABLED  

---

0D — Health por dominio

identity  
social  
personal_finance  
business_finance  
risk  
ledger  

---

0E — Chat → Payment Intent bridge

chat  
→ payment intent  
→ risk  
→ ledger  

---

# CREAR RAMA

git checkout -b feat/stage0-platform-foundation

---

# FLUJO GIT

git add .  
git commit -m "feat(stage0): platform foundation"  
git push origin feat/stage0-platform-foundation

---

# PR

feat/stage0-platform-foundation → main
