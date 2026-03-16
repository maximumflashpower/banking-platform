# Change Policy

## Purpose

This document defines the change discipline for the banking-platform repository.

The goal is to ensure that changes are introduced with the right level of validation, evidence, and rollback awareness.

---

## Change classes

### Low risk
Typical examples:

- documentation only
- comments
- repository organization with no runtime impact
- release notes
- governance files
- runbooks with no script changes

Expected controls:

- review for correctness
- no gateway/runtime validation required unless references changed materially

---

### Medium risk
Typical examples:

- operational scripts
- backup/recovery tooling
- smoke test updates
- diagnostics tooling
- docs tied to executable procedures
- non-critical admin utilities

Expected controls:

- syntax validation
- execution test if applicable
- evidence retained if change affects operations
- project context updated when stage-related

---

### High risk
Typical examples:

- gateway route behavior
- authentication/session logic
- approval flow changes
- step-up enforcement
- resilience controls affecting runtime behavior
- audit pipeline behavior
- inter-domain orchestration logic

Expected controls:

- pre-change snapshot
- regression validation
- smoke tests for impacted stages
- audit evidence verification
- rollback path explicitly documented

---

### Critical risk
Typical examples:

- ledger posting logic
- money movement state transitions
- immutable audit chain logic
- database schema changes in critical financial/security domains
- restore logic affecting production datasets
- direct manipulation of financial integrity paths

Expected controls:

- pre-change snapshot
- backup before change where applicable
- explicit review of rollback path
- targeted validation + regression tests
- evidence retained
- no merge without complete validation notes

---

## Required pre-change discipline

Depending on change risk, the following may be required before implementation:

- `scripts/system_snapshot.sh`
- stage backup or milestone backup
- branch isolation
- clear scope statement
- confirmation of impacted domains

---

## Required post-change discipline

Depending on change risk, the following may be required after implementation:

- syntax checks
- service build / health validation
- smoke tests
- evidence-chain verification
- restore verification
- retained logs/reports
- updates to:
  - `PROJECT_STATUS.md`
  - `STAGE_HISTORY.md`
  - relevant docs

---

## Prohibited change behavior

The following are not acceptable for critical or high-risk changes:

- merging without reproducible validation
- changing gateway behavior without regression checks
- changing financial behavior without evidence
- changing audit logic without verification
- relying on informal memory instead of repository context
- bypassing rollback or recovery thinking

---

## Merge readiness rule

A change is considered merge-ready only when:

1. scope is explicit
2. impacted domains are known
3. validations were executed
4. evidence exists where required
5. rollback path is understood
6. repository context is updated if the change closes or advances a stage
