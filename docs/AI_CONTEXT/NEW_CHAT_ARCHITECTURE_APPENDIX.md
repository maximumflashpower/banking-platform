# ARCHITECTURE APPENDIX
# BANKING CHAT PLATFORM

Este documento define arquitectura técnica base.

---

# DIAGRAMA GENERAL

CLIENT APP

Chat UX  
Contacts UX  
Personal Wallet  
Business Finance  
Financial Inbox  

↓

API GATEWAY

↓

DOMAIN SERVICES

Identity Service  
Social Service  
Wallet Service  
Payments Service  
Ledger Service  
Risk Service  
AML / Case Service  
Governance Service  
Cards Service  
Ops Service  

↓

DATABASES

identity  
social  
financial_db  
risk_db  
case_db  
cards_db  

---

# AISLAMIENTO DE DOMINIOS

social falla → pagos siguen  

personal finance falla → chat sigue  

business finance falla → personal sigue  

risk falla → pagos bloqueados  

---

# SERVICIOS

Identity Service

users  
sessions  
devices  
spaces  
roles  

DB:

identity

---

Social Service

conversations  
messages  
contacts  

DB:

social

---

Wallet Service

wallets  
balances  
account views  

DB:

financial_db

---

Payments Service

payment_intents  
execution states  
rails orchestration  

DB:

financial_db

---

Ledger Service

ledger_accounts  
ledger_journal_entries  
ledger_postings  

DB:

financial_db

---

Risk Service

risk_profiles  
risk_decisions  
signals  

DB:

risk_db

---

Case / AML Service

cases  
case_timeline  
case_evidence  

DB:

case_db

---

Governance Service

approvals  
approval_votes  

DB:

financial_db

---

Cards Service

cards  
authorizations  
settlements  

DB:

cards_db

---

# MODELO DE DATOS BASE

Identity

users  
sessions  
devices  

---

Social

conversations  
messages  
contacts  

---

Financial

wallets  
payment_intents  
transactions  
financial_inbox  

---

Ledger

ledger_accounts  
ledger_entries  
ledger_postings  

---

Risk

risk_profiles  
risk_decisions  

---

Cases

cases  
case_evidence  

---

# HEALTH SEGMENTADO

Endpoint /health debe reportar:

identity  
social  
personal_finance  
business_finance  
risk  
ledger  

---

# KILL SWITCHES

SOCIAL_CHAT_ENABLED  
PERSONAL_BANKING_ENABLED  
BUSINESS_BANKING_ENABLED  
FINANCIAL_INBOX_ENABLED  

---

# RESULTADO DE STAGE 0

Debe permitir:

shell de producto  
separación personal/business  
degradación por dominio  
chat sin romper finanzas
