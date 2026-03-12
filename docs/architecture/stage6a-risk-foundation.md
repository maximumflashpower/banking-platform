# Stage 6A — Risk Foundation & Audit Spine

## Goal
Build the minimum risk engine foundation without hard enforcement.

## Why 6A is separated
Original Stage 6 mixes:
- risk engine
- AML monitoring
- sanctions
- freeze orchestration
- card risk path
- SAR workflow
- sponsor bank escalation

That is too large for a single delivery and violates anti-infection and domain isolation principles if implemented as one step.

## Scope included
- risk base tables
- signal ingestion
- decision evaluation
- immutable audit spine
- risk events
- architecture documentation

## Scope excluded
- real freeze execution
- OFAC enforcement
- SAR workflow
- sponsor bank escalation
- real payment block
- real card block
- ledger mutation

## Domain isolation
Stage 6A only touches:
- risk-db
- gateway-api internal endpoints
- risk event contracts
- risk architecture/docs

Stage 6A must not:
- write to ledger
- write to financial-db
- write to cards-db
- create cross-domain foreign keys
- execute freezes
- publish enforcement commands

## Final runtime status
Stage 6A is now validated against a dedicated `risk_db` through `RISK_DATABASE_URL`.

Validated runtime configuration:
- `RISK_DATABASE_URL=postgres://app:app@db:5432/risk_db`

This means:
- risk persistence is no longer falling back to `DATABASE_URL`
- risk tables are no longer using `social` as the backing store
- Stage 6A now satisfies the intended domain isolation boundary for local runtime validation

## Historical bring-up note
During early local bring-up, `riskDb.js` temporarily resolved to `DATABASE_URL` because `RISK_DATABASE_URL` had not yet been configured.
That temporary configuration used the `social` database as a local backing store for risk tables.

That temporary state has now been superseded by:
- dedicated `risk_db`
- explicit `RISK_DATABASE_URL`
- replayed Stage 6A migration against `risk_db`
- runtime validation against the isolated risk database

## Core data model
- `risk_profiles`
- `risk_signals`
- `risk_decisions`
- `risk_decision_signal_links`
- `risk_actions`
- `risk_audit_immutable`

## Signal flow
Internal system
-> POST /internal/v1/risk/signals/ingest
-> persist `risk_signals`
-> persist immutable audit
-> emit `risk.signal.ingested.v1`

## Decision flow
Internal caller
-> POST /internal/v1/risk/decision/evaluate
-> read explicit or recent signals
-> derive foundation decision
-> persist `risk_decisions`
-> persist `risk_decision_signal_links`
-> persist `risk_actions` as recommended-only
-> persist immutable audit
-> emit `risk.decision.made.v1`

## Foundation decision policy
- critical signal => review
- multiple high signals => review
- elevated pattern => observe
- low evidence => observe
- no signals => allow

## Mandatory governance rule
`reason_code` is mandatory for every decision.

## Audit spine
Every successful ingest and evaluation generates:
- immutable row in `risk_audit_immutable`
- domain event payload for downstream observability

## Operational validation evidence

### Health check
Validated:
- `GET /health`
- response: `{"ok":true,"service":"gateway-api","env":"development"}`

### Validated isolated runtime
Validated environment:
- `RISK_DATABASE_URL=postgres://app:app@db:5432/risk_db`

Validated database:
- `risk_db`

Validated schema in isolated database:
- `risk_profiles`
- `risk_signals`
- `risk_decisions`
- `risk_decision_signal_links`
- `risk_actions`
- `risk_audit_immutable`

### Validated signal ingest
Validated request:
- `POST /internal/v1/risk/signals/ingest`

Validated result in isolated runtime:
- `signal_id: f0abc698-56ba-4be8-ac85-7ecc685ea433`
- `status: ingested`
- `signal_type: velocity.anomaly`
- `subject_type: payment_intent`
- `severity: medium`

### Validated decision evaluate
Validated request:
- `POST /internal/v1/risk/decision/evaluate`

Validated result in isolated runtime:
- `decision_id: 18eed76c-82b7-4e4b-9a79-057af894cc1a`
- `decision_outcome: observe`
- `reason_code: VELOCITY_REVIEW`
- `risk_score: 20`
- `recommended_actions: collect_more_signals`

### Validated audit evidence in `risk_db`
Validated rows:
- `risk_signal | risk.signal.ingested | gateway-api`
- `risk_decision | risk.decision.made | risk-engine-stage6a`

## Migration hygiene
The Stage 6A SQL migration file was normalized during implementation hardening.

Final hygiene status:
- markdown fence contamination removed
- invalid leading prefix removed from `BEGIN;`
- migration replayed successfully in `risk_db`
- replay behavior verified with `IF NOT EXISTS` / idempotent index creation notices only

## Deferred capabilities
Deferred to later stages:
- 6B payment intent risk gate
- 6C sanctions screening foundation
- 6D freeze orchestration
- 6E card auth risk path
- 6F AML analyst workflow / SAR / sponsor bank escalation

## Definition of Done
- can ingest a risk signal
- can evaluate a decision
- `reason_code` is mandatory
- every decision is audited
- risk events are emitted
- no direct ledger modification
- no freeze or real block execution

## Current status
Stage 6A is:
- functionally implemented
- operationally validated end-to-end
- isolated in dedicated `risk_db`
- ready for backup, commit, and PR