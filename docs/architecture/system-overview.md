# System Overview

## Purpose

This document provides a high-level architecture overview of the banking-platform repository.

It is intended to make the system understandable to engineers, operators, reviewers, and auditors without requiring them to reconstruct the architecture from source code alone.

---

## Platform summary

banking-platform is a domain-separated digital banking core focused on:

- identity and session security
- payment orchestration
- financial ledger integrity
- cards authorization
- risk evaluation
- operational resilience
- auditability and evidence retention

---

## Primary domains

### Identity
Responsibilities include:

- users
- business membership
- roles and entitlements
- sessions
- step-up sessions/events
- web QR session flows

### Financial
Responsibilities include:

- payment intents
- approvals
- ledger accounts
- journal entries
- postings
- ACH transfer records
- reconciliation support

### Cards
Responsibilities include:

- card issuance records
- authorization decisions
- captures
- reversals
- settlements
- disputes
- outbox/webhook processing

### Risk
Responsibilities include:

- risk decisions
- risk profiles
- sanctions screening
- signal ingestion
- escalation support

### Case Management
Responsibilities include:

- cases
- case evidence
- timeline
- assignment and escalation support

### Social
Responsibilities include:

- conversations
- messages
- moderation/reporting support

---

## Runtime topology

### Clients

Primary client surfaces include:

- mobile
- web-companion
- admin-portal

### Gateway API

The gateway API is the main orchestration entry point.

Its responsibilities include:

- routing
- cross-domain orchestration
- session enforcement
- entitlement and role checks
- step-up enforcement for protected actions
- audit event emission
- resilience and controlled degradation behavior

It should not erase domain boundaries or become a hidden monolith.

---

## Persistence boundaries

The platform uses domain-aligned PostgreSQL stores, including:

- identity DB
- financial DB
- cards DB
- risk DB
- case DB
- audit-related storage
- social DB

This separation supports ownership clarity, recovery discipline, and safer evolution.

---

## Event model

The repository includes event buses for major domains, including:

- financial-bus
- cards-bus
- risk-bus
- ops-bus
- social-bus

Events provide explicit integration points and make state transitions visible across domain boundaries.

---

## Security model

Current security building blocks include:

- authenticated sessions
- web session status handling
- step-up verification for sensitive actions
- entitlements and role checks
- immutable audit evidence for critical flows

---

## Resilience model

The platform favors controlled and explicit resilience behavior.

Examples include:

- rail kill switches
- degraded cards response when cards rail is disabled
- explicit ACH disabled rejection
- resilience audit events
- operational snapshot tooling
- backup and restore verification

---

## Audit and evidence model

The system includes immutable evidence-chain behavior for critical actions.

Confirmed evidence categories include:

- approval vote recording
- step-up requested
- step-up verified
- space switch completed
- rail kill-switch blocked

The audit evidence chain is expected to remain verifiable.

---

## Backup and recovery model

Stage 8E establishes:

- encrypted backups
- checksum traceability
- restore verification into scratch databases
- retained recovery evidence
- ledger consistency validation after restore

Recovery is treated as a verifiable capability, not a documentation-only claim.

---

## High-level logical diagram

```text
Clients
  ├── mobile
  ├── web-companion
  └── admin-portal

        │
        ▼

Gateway API
  ├── identity/session checks
  ├── payment orchestration
  ├── cards authorization routing
  ├── audit recording
  └── resilience / degradation controls

        │
        ├──────────────► Identity DB
        ├──────────────► Financial DB
        ├──────────────► Cards DB
        ├──────────────► Risk DB
        ├──────────────► Case DB
        ├──────────────► Audit-related storage
        └──────────────► Social DB

Event buses
  ├── financial
  ├── cards
  ├── risk
  ├── ops
  └── social

---

## Crear ADRs

```bash
cat > docs/adr/ADR-001-domain-separation.md <<'EOF'
# ADR-001: Domain Separation

## Status
Accepted

## Context

The platform contains multiple concerns with different integrity and control needs, including identity, ledger, cards, risk, case handling, and social features.

A single undifferentiated persistence and ownership model would increase coupling, reduce recovery clarity, and weaken control boundaries.

## Decision

The platform will maintain domain separation across major capabilities, including distinct data ownership and clear responsibility boundaries.

Primary domains include:

- identity
- financial
- cards
- risk
- case-management
- social

## Consequences

### Positive
- clearer ownership
- safer recovery
- reduced accidental coupling
- better audit and governance posture

### Trade-offs
- more orchestration complexity
- more documentation needed
- more discipline required for cross-domain changes
