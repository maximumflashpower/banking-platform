# PROJECT STATUS --- Banking Platform

Last updated: 2026-03-15T21:47:45.043695 UTC

## Repository

https://github.com/maximumflashpower/banking-platform

Project directory: \~/projects/banking-platform

Backups directory: \~/backups/banking-platform

## Environment

-   Node.js v20
-   PostgreSQL
-   Docker Compose
-   Ubuntu

## Current Completed Stages

  Stage      Description                                   Status
  ---------- --------------------------------------------- --------
  Stage 7C   Approvals / step‑up workflow                  ✔
  Stage 7D   Secure web sessions                           ✔
  Stage 8A   Observability foundation                      ✔
  Stage 8B   Immutable audit trail + evidence endpoint     ✔
  Stage 8C   Passive resilience                            ✔
  Stage 8D   Rail kill switches + controlled degradation   ✔

## Stage 8D Highlights

Rails controlled by env flags:

RAILS_ACH_ENABLED RAILS_CARDS_ENABLED

Behavior:

ACH disabled → HTTP 503 `rail_disabled` Cards disabled → HTTP 200
degraded decline

Audit event emitted: operations.resilience → rail.kill_switch.blocked

Health endpoint exposes rail status: GET /health

## Validation Completed

-   Syntax checks
-   Docker rebuild
-   Smoke tests for Stage 7C / 7D / 8B
-   Evidence chain verified
-   ACH rail OFF test
-   Cards rail OFF test

## Evidence chain validation command

``` bash
python3 - <<'PY'
import json, urllib.request
data = json.load(urllib.request.urlopen("http://localhost:3000/internal/v1/audit/evidence?limit=100"))
print("chain_verified =", data.get("chain_verified"))
print(sorted({item.get("event_type") for item in data.get("items", [])}))
PY
```

Expected:

chain_verified = True

## Stage 8E — Backups y recovery verificable
Status: IN PROGRESS

Scope:
- encrypted backup set for identity, financial, cards, risk, case, audit
- 30-day retention policy
- restore verification in scratch databases
- ledger consistency check after restore
- recovery evidence written to logs/recovery-evidence/

Constraints:
- must not impact gateway request path
- must preserve existing smoke tests
- must not break immutable audit evidence chain