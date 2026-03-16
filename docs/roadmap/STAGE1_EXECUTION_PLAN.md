# STAGE 1 — IDENTITY FOUNDATION

Estado: planificación
Prioridad: crítica
Dependencias: Stage 0 — Platform Refoundation

---

# Objetivo

Construir la base de identidad del sistema que permita soportar:

* identidad social
* autorización financiera
* sesiones diferenciadas
* step-up authentication
* identidad consciente del espacio activo

Sin mezclar privilegios entre dominios.

Regla central:

**social identity ≠ financial authorization**

---

# Principios de diseño

## Separación de identidad y autorización

Un usuario puede existir en el sistema sin tener acceso financiero.

La identidad es global.
La autorización es contextual.

---

## Separación de sesiones

Se introducen dos tipos de sesión:

* social_session
* financial_session

Una sesión social **no otorga acceso financiero**.

---

## Elevación de seguridad (Step-up)

Acciones financieras sensibles requieren verificación adicional.

Ejemplos:

* aprobar pagos
* cambiar espacio financiero
* operaciones de alto riesgo

---

## Contexto por espacio

Toda autorización se evalúa contra:

* usuario
* sesión
* espacio activo
* tipo de espacio
* roles o entitlements

---

# Subetapas de ejecución

## 1A — Core Identity Records

Meta:

Definir el registro base de usuario reutilizable por todos los dominios.

Entregables:

* tabla users
* repositorio base de usuario
* login/logout básico
* hooks de auditoría

---

## 1B — Social Identity Layer

Meta:

Separar perfil social del core de identidad.

Entregables:

* perfil social
* contactos
* configuraciones sociales
* endpoints de lectura/actualización

---

## 1C — Session Foundation

Meta:

Introducir el modelo de sesiones diferenciadas.

Entregables:

* social_session
* financial_session
* expiración
* revocación
* lifecycle management

---

## 1D — Step-up Authentication

Meta:

Agregar elevación temporal de confianza.

Entregables:

* request step-up
* confirm step-up
* TTL
* consumo controlado
* eventos auditables

---

## 1E — Space-aware Identity

Meta:

Integrar identidad con el modelo de espacios.

Entregables:

* resolución de espacio activo
* validación de membership
* validación de roles
* validación de entitlements

---

# Pruebas requeridas

## Core identity

* usuario puede autenticarse
* usuario deshabilitado no puede autenticarse
* perfil base se puede leer

---

## Social identity

* perfil social se puede actualizar
* contactos no afectan permisos financieros

---

## Session model

* login crea social_session
* social_session no puede ejecutar operaciones financieras
* financial_session requiere contexto válido

---

## Step-up

* acción sensible sin step-up falla
* step-up válido permite ejecución
* step-up no puede reutilizarse

---

## Space-aware identity

* cambio de espacio invalida contexto previo
* usuario sin membership no puede operar

---

# Definition of Done

Stage 1 queda completo cuando:

* existe usuario base autenticable
* existe perfil social separado
* existen social_session y financial_session
* acciones financieras sensibles requieren step-up
* social identity no otorga privilegios financieros
* cambios de espacio no fugan privilegios
* smoke tests existentes siguen pasando

---

# No objetivos

Stage 1 no debe modificar:

* ledger
* settlement financiero
* rails de pago
* backups
* runbooks
* auditoría existente
