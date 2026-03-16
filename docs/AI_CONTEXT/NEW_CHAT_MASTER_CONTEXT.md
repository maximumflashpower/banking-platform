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

WeChat  
WhatsApp  
Telegram  

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

Separación obligatoria:

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
Node.js v20.11.1  
PostgreSQL  

Servicios docker:

api  
db  

---

# BASES DE DATOS

identity  
financial_db  
cards_db  
risk_db  
case_db  
social  

---

# AUDIT TRAIL

Verificar:

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

# NUEVA ETAPA

Stage 0 — Platform Refoundation
