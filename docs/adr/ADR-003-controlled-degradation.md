# ADR-003: Controlled Degradation for Rail Failures

## Status
Accepted

## Context

When external payment rails or processing paths are unavailable, implicit or inconsistent failure behavior can create confusion, hidden risk, and poor operator visibility.

## Decision

The platform will use explicit kill-switch and controlled degradation behavior for affected rails.

Examples include:

- ACH disabled -> explicit rejection
- cards disabled -> controlled degraded response
- resilience audit events for blocked actions

## Consequences

### Positive
- predictable operator behavior
- safer failure mode
- better observability and auditability

### Trade-offs
- additional resilience logic must be maintained
- client expectations need to be documented
