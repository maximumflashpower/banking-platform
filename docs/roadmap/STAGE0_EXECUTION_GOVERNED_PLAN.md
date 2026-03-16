# STAGE 0 — PLATFORM REFOUNDATION
# GOVERNED EXECUTION PLAN

Proyecto: banking-platform  
Producto: Chat Super App + Embedded Finance

Este documento define cómo iniciar la nueva etapa del proyecto sin comprometer:

- la infraestructura financiera
- la estabilidad del entorno
- la gobernanza del CORE

Este documento sustituye cualquier plan informal previo.

---

# 1. PRINCIPIO FUNDAMENTAL

La aplicación es:

Chat platform  
+
Financial infrastructure

Pero el sistema financiero **no puede ser controlado por el chat**.

Regla obligatoria:

chat → payment_intent → risk → ledger → confirmación

Nunca:

chat → ledger directo

---

# 2. PROTECCIÓN DEL CORE

El CORE del sistema incluye:

Identity  
Ledger  
Risk  
AML  
Governance  

Este CORE es **regulado por diseño**. :contentReference[oaicite:2]{index=2}

El CORE debe tratarse como infraestructura estratégica.

Nunca debe:

- contaminarse con lógica experimental
- mezclarse con productos sociales
- compartir base de datos con otros productos

---

# 3. CLASIFICACIÓN DEL PROYECTO

La Super App pertenece a:

Tipo A — Financiero Regulado. :contentReference[oaicite:3]{index=3}

Porque usa:

Ledger  
Risk  
AML  
Governance  

Por lo tanto:

Toda arquitectura debe proteger el CORE.

---

# 4. POLÍTICA DE ENTORNO (ANTI-INFECTION)

El proyecto adopta la política oficial:

DEPENDENCY & ENVIRONMENT POLICY v1.1. :contentReference[oaicite:4]{index=4}

Principios obligatorios:

Docker controla el runtime. :contentReference[oaicite:5]{index=5}

Node fijo:

20.11.1

Imagen Docker obligatoria:

node:20.11.1-alpine

Prohibido:

node:lts  
node:latest  

El repositorio debe vivir en:

/home/.../projects

Nunca en:

/mnt/c

---

# 5. DISCIPLINA DE DEPENDENCIAS

Reglas obligatorias:

lockfile obligatorio  
instalación congelada  
upgrade solo en branch upgrade/*

Instalación:

npm ci

Nunca:

npm install

Cambios de dependencias:

solo dentro de Upgrade Window. :contentReference[oaicite:6]{index=6}

---

# 6. OBJETIVO DE STAGE 0

Stage 0 prepara la arquitectura para el producto final.

No agrega funcionalidades grandes.

Introduce:

product shell  
space isolation  
capability switches  
segmented health  
chat → payment intent bridge  

---

# 7. SUBETAPAS

## 0A — PRODUCT SHELL

Crear estructura visible del producto.

Módulos:

Chats  
Contacts  
Personal  
Business  
Financial Inbox  
Settings

---

## 0B — SPACE ISOLATION

Separar:

Personal Space  
Business Space

Requisitos:

active_space_id  
active_space_type  

Cambio de espacio requiere step-up.

---

## 0C — CAPABILITY SWITCHES

Flags:

SOCIAL_CHAT_ENABLED  
PERSONAL_BANKING_ENABLED  
BUSINESS_BANKING_ENABLED  
FINANCIAL_INBOX_ENABLED  

Permiten degradación segura.

---

## 0D — SEGMENTED HEALTH

Endpoint /health debe reportar dominios:

identity  
social  
personal_finance  
business_finance  
risk  
ledger  
financial_inbox  

Ejemplo:

{
 "domains": {
  "identity":"ok",
  "social":"ok",
  "personal_finance":"ok",
  "business_finance":"ok",
  "risk":"ok",
  "ledger":"ok"
 }
}

---

## 0E — CHAT → PAYMENT INTENT BRIDGE

El chat puede iniciar pagos.

Pero no ejecutarlos.

Flujo:

Chat UI  
→ Payment Intent  
→ Risk  
→ Governance si aplica  
→ Ledger  

---

# 8. REGLAS DE AISLAMIENTO

Fallos permitidos:

Chat falla → finanzas siguen  
Personal finance falla → chat sigue  
Business finance falla → personal sigue  

Risk falla:

bloquea nuevas operaciones.

---

# 9. PRUEBAS OBLIGATORIAS

Antes de cualquier cambio:

git status  
git log  
docker compose ps  

Smoke tests:

stage7c_smoke_test.sh  
stage7d_smoke_test.sh  
stage8b_audit_smoke_test.sh  

---

# 10. BACKUP OBLIGATORIO

Antes de modificar código:

export BACKUP_ENCRYPTION_KEY="KEY"

POSTGRES_SERVICE=db POSTGRES_USER=app bash scripts/backup_stage8e.sh

Verificar checksum.

---

# 11. NUEVO SMOKE TEST

Stage 0 introduce:

scripts/stage0_smoke_test.sh

Debe validar:

health segmentado  
capability switches  
aislamiento de dominios  
audit chain intacta

---

# 12. RAMA DE DESARROLLO

Crear rama:

git checkout -b feat/stage0-platform-foundation

---

# 13. COMMIT SUGERIDO

feat(stage0): platform foundation for product experience

---

# 14. PR SUGERIDO

feat(stage0-platform-foundation → main)

Descripción:

- product shell
- capability switches
- segmented health
- space isolation
- safe chat→payment intent bridge

---

# 15. CRITERIOS DE ACEPTACIÓN

Stage 0 está completo si:

health segmentado funciona  
capability switches funcionan  
space isolation funciona  
chat no toca ledger  
audit chain sigue intacta  
backups siguen funcionando  

---

# 16. PRINCIPIO FINAL

Si hay conflicto entre velocidad y seguridad:

Elegir seguridad.

Si hay conflicto entre conveniencia y aislamiento del CORE:

Elegir aislamiento del CORE.

El CORE es infraestructura estratégica.
