# ADR-006 — Identity Session Separation

Estado: aceptado
Fecha: 2026
Relacionado con: Stage 1 — Identity Foundation

---

# Contexto

El sistema combina funcionalidades sociales y financieras.

Permitir que una sesión social controle operaciones financieras
introduce riesgos significativos de seguridad.

Es necesario separar explícitamente los contextos de sesión.

---

# Decisión

Se introducen dos tipos de sesión:

social_session
financial_session

---

# social_session

Permite:

* chat
* perfil
* contactos
* navegación social

No permite:

* aprobaciones financieras
* acciones sensibles
* operaciones monetarias

---

# financial_session

Permite:

* consultas financieras
* operaciones autorizadas
* acciones protegidas

Puede requerir step-up adicional.

---

# Step-up Authentication

Para acciones sensibles se introduce una elevación temporal.

Características:

* TTL corto
* target específico
* consumo único o controlado
* registro en auditoría

---

# Contexto de espacio

Toda autorización se evalúa en relación con:

* espacio activo
* tipo de espacio
* rol del usuario
* entitlements

---

# Consecuencias

Beneficios:

* reduce superficie de ataque
* separa dominios sociales y financieros
* mejora auditoría y trazabilidad

Costos:

* mayor complejidad en gestión de sesiones
* más lógica en gateway

---

# Alternativas consideradas

### Usar una sola sesión

Rechazado porque mezcla dominios de riesgo.

### Separar completamente sistemas

Rechazado por impacto en experiencia de usuario.

---

# Resultado

La separación de sesiones permite mantener un modelo híbrido
sin comprometer la seguridad del core financiero.
