# Identity Architecture

---

# Visión general

El sistema de identidad soporta tres capas:

1. Core Identity
2. Social Identity
3. Financial Authorization

Estas capas interactúan pero mantienen fronteras claras.

---

# Core Identity

Responsable de:

* usuario base
* credenciales
* estado del usuario
* dispositivos asociados

No incluye lógica social ni financiera.

---

# Social Identity

Responsable de:

* perfil social
* contactos
* preferencias sociales

Esta capa mejora la experiencia social pero no controla
privilegios financieros.

---

# Financial Authorization

Responsable de:

* sesiones financieras
* step-up authentication
* validación de contexto

---

# Modelo de sesiones

## social_session

Permite interacción social básica.

Limitaciones:

* no ejecuta operaciones financieras
* no autoriza acciones sensibles

---

## financial_session

Permite operaciones financieras protegidas.

Puede requerir step-up adicional.

---

# Step-up Authentication

Step-up introduce elevación temporal de confianza.

Ejemplos de uso:

* aprobar pagos
* cambio de espacio
* modificación de seguridad

---

# Contexto de espacio

La autorización depende del espacio activo.

Un usuario puede tener múltiples espacios:

* personal
* business

Cada espacio puede tener roles y entitlements distintos.

---

# Flujo típico

## Login

usuario → autenticación → social_session

---

## Acción financiera

usuario → financial_session
→ step-up si es requerido
→ ejecución

---

# Reglas de seguridad

1. social_session nunca ejecuta operaciones financieras
2. step-up tiene duración limitada
3. contexto de espacio siempre se valida
4. todas las elevaciones se auditan
