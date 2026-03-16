# ARCHITECTURE APPENDIX
# BANKING CHAT PLATFORM

Arquitectura base del sistema.

---

# DOMINIOS

Identity  
Social  
Wallet  
Payments  
Ledger  
Risk  
AML / Cases  
Governance  
Cards  
Notifications  
Ops  

---

# PRINCIPIO CENTRAL

Chat nunca controla dinero.

Flujo obligatorio:

Chat  
→ Payment Intent  
→ Risk  
→ Governance  
→ Ledger  
→ Confirmación  

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

DB: identity

---

Social Service

conversations  
messages  
contacts  

DB: social

---

Wallet Service

wallets  
balances  

DB: financial_db

---

Payments Service

payment_intents  
execution states  

DB: financial_db

---

Ledger Service

ledger_accounts  
ledger_journal_entries  
ledger_postings  

DB: financial_db

---

Risk Service

risk_profiles  
risk_decisions  

DB: risk_db

---

AML / Case Service

cases  
case_evidence  

DB: case_db

---

Governance Service

approvals  
approval_votes  

DB: financial_db

---

Cards Service

cards  
authorizations  
settlements  

DB: cards_db

---

# HEALTH SEGMENTADO

Endpoint /health debe reportar:

identity  
social  
personal_finance  
business_finance  
risk  
ledger  
financial_inbox
