# ADR-002: Immutable Audit Evidence Chain

## Status
Accepted

## Context

Critical actions in a financial platform require retained evidence that is resistant to silent mutation and can be independently verified.

Examples include approvals, step-up actions, space switching, and resilience controls.

## Decision

The platform will maintain an immutable audit evidence chain for critical actions and expose verification capability through retained evidence and validation procedures.

## Consequences

### Positive
- stronger integrity guarantees
- clearer audit posture
- better incident reconstruction
- more defensible operational history

### Trade-offs
- additional implementation complexity
- verification discipline must be preserved
- future changes must avoid breaking evidence continuity
