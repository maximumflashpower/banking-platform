```md
# POST /internal/v1/risk/signals/ingest

## Purpose
Ingest a risk signal into the Stage 6A risk foundation.

## Stage boundary
This endpoint is Stage 6A foundation only.
It does not freeze spaces, block cards, block payments, file SARs, or trigger sponsor bank escalation.

## Request

```json
{
  "signal_type": "velocity.anomaly",
  "subject_type": "payment_intent",
  "subject_id": "11111111-1111-1111-1111-111111111111",
  "space_id": "22222222-2222-2222-2222-222222222222",
  "source_system": "gateway-api",
  "severity": "medium",
  "observed_at": "2026-03-11T18:00:00.000Z",
  "payload": {
    "window_minutes": 15,
    "attempt_count": 4
  },
  "idempotency_key": "risksig-stage6a-001"
}
```