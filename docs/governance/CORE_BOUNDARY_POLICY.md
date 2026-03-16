# CORE BOUNDARY POLICY
# Banking Platform Governance

Versión: 1.0  
Estado: activo

Este documento define cómo se protege el CORE regulado del sistema.

Debe leerse antes de iniciar cualquier nuevo módulo o proyecto.

---

# 1. DEFINICIÓN DEL CORE

El CORE es la infraestructura financiera crítica del sistema.

Incluye:

Identity  
Ledger  
Risk Engine  
AML Framework  
Approval Engine  
Governance multi-owner  

Este CORE se considera **infraestructura regulada por diseño**.

Debe tratarse como infraestructura estratégica.

---

# 2. PRINCIPIO FUNDAMENTAL

El CORE **no puede ser controlado por componentes sociales**.

Regla obligatoria:

Chat → Payment Intent → Risk → Governance → Ledger → Confirmación

Nunca:

Chat → Ledger directo

Nunca:

Social Service → Ledger

---

# 3. AISLAMIENTO OBLIGATORIO

Nunca se permite:

Compartir bases de datos entre dominios.

Social DB ≠ Financial DB.

Nunca mezclar:

social
financial
risk
aml

Cada dominio debe tener:

base separada  
servicio separado  
límites claros

---

# 4. CLASIFICACIÓN DE PROYECTOS

Todo proyecto debe clasificarse.

### Tipo A — Financiero Regulado

Usa:

Ledger  
Risk  
AML  
Governance  

Ejemplos:

wallet  
pagos  
fintech  

Requiere aprobación de riesgo.

---

### Tipo B — Financiero No Custodial

Usa:

Identity  
Governance  

No usa:

custodia de fondos

---

### Tipo C — Plataforma Colaborativa

Usa:

Identity  

No usa:

Ledger  
AML  

---

### Tipo D — Producto Independiente

No usa el CORE regulado.

Ejemplos:

app social pura  
herramienta interna  

---

# 5. REGLAS DE SEGURIDAD

Nunca permitir:

mezclar fondos entre productos  
exponer ledger a servicios no financieros  
usar risk engine sin evaluación  

---

# 6. MODELO DE ARQUITECTURA

El CORE se organiza así:

Identity Service  
Ledger Service  
Risk Service  
AML Service  
Governance Service  

Servicios externos (no CORE):

Social Service  
Chat Service  
Notifications  
UI / Gateway  

---

# 7. PRINCIPIO DE PROTECCIÓN

El CORE es un activo estratégico del sistema.

Debe protegerse como si fuera:

infraestructura bancaria.

---

# 8. REGLA FINAL

Si un cambio pone en riesgo el CORE:

el cambio debe rechazarse.

Seguridad del CORE > velocidad de desarrollo.
