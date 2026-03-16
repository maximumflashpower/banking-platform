# ADR-004: Encrypted Backups and Verifiable Restore

## Status
Accepted

## Context

A backup strategy is not operationally meaningful unless restore can be verified and evidence retained.

Because the platform includes sensitive and integrity-critical data, backup artifacts also require protection at rest.

## Decision

The platform will support:

- encrypted multi-database backup artifacts
- checksum traceability
- restore verification into scratch databases
- retained recovery evidence
- post-restore ledger consistency checks

## Consequences

### Positive
- improved resilience posture
- defensible recovery capability
- clearer operator confidence
- stronger evidence for operational readiness

### Trade-offs
- more scripting and procedural overhead
- encryption key handling must be disciplined
- restore verification must remain reproducible over time
