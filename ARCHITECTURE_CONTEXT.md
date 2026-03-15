# ARCHITECTURE CONTEXT --- Banking Platform

## Core Service

gateway-api

Responsibilities: - payments orchestration - card authorization
decisions - audit logging - resilience controls - internal rails routing

## Databases

identity financial cards risk case audit

## Key Components

### Payments

services/payments/

Handles: - ACH submit - orchestration - rails adapters

### Cards

services/cards/

Handles: - authorization decision logic - balance checks - risk
scoring - ledger holds

### Resilience

services/resilience/

Includes: - railSwitches - degradationResponses - errorTypes

### Audit

services/audit/

Immutable audit event logging Evidence chain verification

## Health Endpoint

GET /health

Returns: - service health - rail status - timestamps

## Audit Evidence Endpoint

GET /internal/v1/audit/evidence

Used for chain verification of immutable audit logs.

## Docker Services

banking_api banking_postgres

Compose rebuild:

docker compose up -d --build api
