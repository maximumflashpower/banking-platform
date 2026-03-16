# ACCESS CONTROL POLICY — Banking Platform

## Purpose

Define internal operational roles and separation of duties for sensitive system operations.

The objective is to prevent a single operator from controlling critical operational paths.

---

## Operational Roles

### Platform Admin

Responsibilities:

- infrastructure configuration
- Docker environment management
- deployment operations
- container recovery

Permissions:

- rebuild services
- inspect logs
- manage runtime configuration

Restrictions:

- cannot execute encrypted backup restore
- cannot approve financial actions

---

### Operator

Responsibilities:

- operational monitoring
- smoke test execution
- evidence verification
- incident response

Permissions:

- run operational scripts
- run smoke tests
- verify evidence chain

Restrictions:

- cannot perform restore operations
- cannot disable rails

---

### Security Officer

Responsibilities:

- cryptographic operations
- backup key custody
- restore authorization
- security verification

Permissions:

- authorize backup encryption keys
- authorize restore verification
- approve recovery evidence

Restrictions:

- cannot modify runtime services
- cannot deploy containers

---

## Sensitive Operations

Sensitive operations require role separation.

Operations:

backup creation  
backup restore  
rail degradation control  
system recovery  
audit evidence validation

---

## Two-person rule

For critical operations:

backup restore  
rail disabling in production  
recovery operations  

Two independent roles must participate.

Example:

Operator executes procedure  
Security Officer authorizes keys

---

## Evidence preservation

All sensitive operations must preserve evidence via:

/internal/v1/audit/evidence

Evidence verification must remain available and chain integrity must remain true.

Expected baseline:

chain_verified = True

---

## Enforcement model

Current enforcement:

process + operational policy

Future enforcement may include:

- role-based operational CLI
- privileged operation tokens
- approval workflows

