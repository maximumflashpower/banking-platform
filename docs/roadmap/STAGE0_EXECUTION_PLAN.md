# STAGE 0 — PLATFORM REFOUNDATION

Objetivo:

Preparar la base del producto sin romper la infraestructura financiera existente.

---

# SUBETAPAS

0A — Product shell  
0B — Space isolation  
0C — Capability switches  
0D — Segmented health  
0E — Chat → Payment Intent bridge  

---

# PRODUCT SHELL

Crear módulos visibles:

Chats  
Contacts  
Personal  
Business  
Financial Inbox  
Settings  

---

# SPACE ISOLATION

Separar:

Personal Space  
Business Space  

Variables:

active_space_id  
active_space_type  

---

# CAPABILITY SWITCHES

SOCIAL_CHAT_ENABLED  
PERSONAL_BANKING_ENABLED  
BUSINESS_BANKING_ENABLED  
FINANCIAL_INBOX_ENABLED  

---

# SEGMENTED HEALTH

Health debe reportar dominios.

Ejemplo:

{
 "domains":{
  "identity":"ok",
  "social":"ok",
  "personal_finance":"ok",
  "business_finance":"ok",
  "risk":"ok",
  "ledger":"ok"
 }
}

---

# PRUEBAS

Antes de cambios:

docker compose ps  
git status  

Tests:

stage7c_smoke_test.sh  
stage7d_smoke_test.sh  
stage8b_audit_smoke_test.sh  

---

# BACKUP

export BACKUP_ENCRYPTION_KEY="KEY"

POSTGRES_SERVICE=db POSTGRES_USER=app bash scripts/backup_stage8e.sh

---

# RAMA

git checkout -b feat/stage0-platform-foundation
