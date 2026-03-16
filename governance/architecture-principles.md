# Architecture Principles

## Purpose

This document defines the non-negotiable architecture principles for the banking-platform repository.

These principles exist to preserve domain integrity, operational safety, auditability, and controlled evolution of the system.

---

## Principles

### 1. Domain separation is mandatory
Each domain owns its own data model, operational logic, and persistence boundary.

Core platform domains currently include:

- identity
- financial
- cards
- risk
- case-management
- social

No domain should directly mutate another domain's database outside of explicitly approved operational tooling.

---

### 2. The gateway orchestrates, but does not collapse domain ownership
The gateway API may coordinate flows across domains, but it must not become a hidden monolith that erases domain boundaries.

The gateway is allowed to:

- route requests
- orchestrate approved cross-domain workflows
- enforce access/session/security checks
- record audit events
- apply resilience and degradation logic

The gateway must avoid:

- ad hoc direct domain coupling
- uncontrolled cross-domain writes
- silent bypass of audit/security boundaries

---

### 3. Critical actions must be auditable
All money movement, privileged actions, sensitive identity transitions, and resilience controls must produce auditable evidence.

Examples include:

- approvals
- step-up verification
- space switching
- rail kill-switch enforcement
- operational recovery validation

---

### 4. Immutable evidence is required for security-sensitive and money-moving flows
Where evidence integrity matters, append-only or cryptographically chained audit evidence must be preserved.

The evidence chain must remain independently verifiable.

---

### 5. Controlled degradation is preferred over hidden failure
If a dependency, rail, or external capability becomes unavailable, the system should degrade in a controlled and observable way instead of failing silently or corrupting state.

Examples:

- explicit ACH disabled rejection
- controlled cards degradation response
- resilience audit event emission

---

### 6. Recovery procedures must be reproducible
Backups, restores, and integrity checks must be executable from documented scripts and procedures.

Recovery is not considered real unless it has been verified.

---

### 7. Stage completion requires executable validation and retained evidence
A stage is not complete based only on code changes.

A stage is complete when all of the following exist:

- design intent
- implemented change
- reproducible commands
- validation output
- retained evidence
- updated project status/history

---

### 8. Operational safety takes priority over convenience
Shortcuts that reduce auditability, rollback clarity, or domain safety are not acceptable for critical flows.

---

### 9. Repository structure must reflect system reality
Architecture, operations, governance, releases, and evidence should be visible in the repository structure, not hidden in chat history or individual memory.

---

### 10. Changes should be understandable by a future operator
A competent operator or reviewer should be able to determine:

- what changed
- why it changed
- how it is validated
- how it is rolled back
- what evidence proves it
