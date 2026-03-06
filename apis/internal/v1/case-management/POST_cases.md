# POST /internal/v1/cases

Create a new internal operations case for AML review, support, disputes, recovery, or legal hold workflows.

## Purpose

This endpoint creates the root case aggregate in the case-management domain.

The endpoint is intended for internal systems and admin tooling only. Creation should be auditable, idempotent, and safe to call from event-driven flows such as:

- risk manual review
- bank escalation
- payment rejection
- fraud detection
- user report
- support ticket

## Authentication / Authorization

Internal only.

The caller must be a trusted internal service or admin operator with permission to create cases.

## Headers

- `Content-Type: application/json`
- `Idempotency-Key: <required>`
- `X-Correlation-Id: <optional>`
- `X-Request-Id: <optional>`

## Request body

```json
{
  "domain": "aml_risk",
  "origin": "risk_signal",
  "priority": "high",
  "severity": "high",
  "title": "Manual AML review required",
  "summary": "Risk engine flagged payment behavior for analyst review.",
  "business_id": "8b4d2f2e-2df2-4e67-a3c8-d6a6bb92b111",
  "user_id": "2a7d9b0f-4444-4f6c-b9cf-58e29b52b222",
  "source_system": "risk",
  "source_reference": "risk_signal_001",
  "external_object_type": "payment_intent",
  "external_object_id": "pi_123",
  "dedupe_key": "aml:risk_signal_001:pi_123"
}
```

## Request fields

- `domain` required  
  Allowed values:
  - `aml_risk`
  - `support`
  - `disputes`
  - `recovery`
  - `legal_hold`

- `origin` required  
  Allowed values:
  - `risk_signal`
  - `payment_rejection`
  - `fraud_detection`
  - `user_report`
  - `support_ticket`
  - `manual`

- `priority` optional  
  Allowed values:
  - `low`
  - `normal`
  - `high`
  - `urgent`  
  Default: `normal`

- `severity` optional  
  Allowed values:
  - `low`
  - `medium`
  - `high`
  - `critical`  
  Default: `medium`

- `title` required  
  Short operator-facing summary.

- `summary` required  
  Longer description of why the case exists.

- `business_id` optional  
  Business context for the case.

- `user_id` optional  
  End-user context for the case.

- `source_system` optional  
  Producing system, for example `risk`, `payments`, `support`.

- `source_reference` optional  
  Source event id, ticket id, or signal id.

- `external_object_type` optional  
  Related object type, for example `payment_intent`, `risk_signal`, `card_dispute`.

- `external_object_id` optional  
  Related object identifier.

- `dedupe_key` optional but strongly recommended for event-driven creation  
  Used to suppress duplicate case creation across retries and repeated upstream events.

## Behavioral rules

- The endpoint is idempotent by `Idempotency-Key`.
- If `dedupe_key` already exists, the existing case should be returned instead of creating a new one.
- A newly created case starts in state `open`.
- Case creation must also append a `case_created` entry to `case_timeline`.
- The service should publish `ops.case.created.v1` after successful commit.

## Success response

HTTP `201 Created`

```json
{
  "ok": true,
  "case": {
    "id": "9db12fa5-8db2-4c2f-8b60-c6a2a9a41111",
    "case_number": 10001,
    "domain": "aml_risk",
    "origin": "risk_signal",
    "state": "open",
    "priority": "high",
    "severity": "high",
    "title": "Manual AML review required",
    "summary": "Risk engine flagged payment behavior for analyst review.",
    "business_id": "8b4d2f2e-2df2-4e67-a3c8-d6a6bb92b111",
    "user_id": "2a7d9b0f-4444-4f6c-b9cf-58e29b52b222",
    "source_system": "risk",
    "source_reference": "risk_signal_001",
    "external_object_type": "payment_intent",
    "external_object_id": "pi_123",
    "opened_at": "2026-03-05T22:00:00Z",
    "created_at": "2026-03-05T22:00:00Z",
    "updated_at": "2026-03-05T22:00:00Z"
  }
}
```

## Idempotent replay response

HTTP `200 OK`

```json
{
  "ok": true,
  "case": {
    "id": "9db12fa5-8db2-4c2f-8b60-c6a2a9a41111",
    "case_number": 10001,
    "domain": "aml_risk",
    "origin": "risk_signal",
    "state": "open"
  },
  "idempotent_replay": true
}
```

## Error responses

HTTP `400 Bad Request`

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_CASE_REQUEST",
    "message": "domain is invalid"
  }
}
```

HTTP `409 Conflict`

```json
{
  "ok": false,
  "error": {
    "code": "CASE_DEDUPE_CONFLICT",
    "message": "A case already exists for the provided dedupe key"
  }
}
```

HTTP `500 Internal Server Error`

```json
{
  "ok": false,
  "error": {
    "code": "CASE_CREATE_FAILED",
    "message": "Unable to create case"
  }
}
```

## Notes

- Keep the current case state in `cases`.
- Use `case_timeline` as immutable audit history.
- Avoid cross-database foreign keys for external objects.
