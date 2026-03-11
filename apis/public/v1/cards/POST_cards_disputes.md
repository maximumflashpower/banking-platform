# POST /public/v1/cards/disputes

Creates a basic card dispute flow fully isolated from the core transactional path.

## Purpose

This endpoint opens a dispute for a card transaction and triggers the minimal operational workflow required for dispute handling.

It does **not** perform:
- chargeback processing
- financial compensation
- arbitration
- ledger adjustments
- authorization/capture/settlement mutations

## Headers

Required:
- `Content-Type: application/json`
- `Idempotency-Key: <string>`
- `X-Space-Id: <uuid>`

Optional:
- `X-Actor-Id: <uuid>`
- `X-Correlation-Id: <string>`

## Request body

```json
{
  "card_id": "41dc3791-c90b-49fd-8d34-247d4cf6151e",
  "authorization_id": "39f847c0-074f-498c-8eb2-375dc078245c",
  "capture_id": "6f099558-4efa-419d-a501-bc26bdbe0985",
  "settlement_id": "44150117-8f86-4f74-8ffd-577a29f2c12c",
  "reason_code": "fraud_card_not_present",
  "description": "Unknown transaction reported by customer"
}
```

## Validation rules

- `Idempotency-Key` is required
- `X-Space-Id` is required
- `card_id` is required
- `reason_code` is required
- at least one transaction reference must be present:
  - `authorization_id`
  - `capture_id`
  - `settlement_id`

## Behavior

When the request succeeds, the system:

1. creates a record in `card_disputes`
2. emits `card.dispute.opened.v1`
3. creates a case in case-management with `domain=disputes`
4. creates the initial timeline entry
5. creates a financial inbox update

## Response 201

```json
{
  "dispute_id": "0e5ed19b-49cf-4515-bb9e-692c1c3bdf30",
  "status": "opened",
  "case_id": "0e4021e8-471f-456b-a0f3-f48a77176a04",
  "inbox_message_id": "3ce25d3d-093d-417c-8e05-9a6b34d8d714",
  "event_type": "card.dispute.opened.v1"
}
```

## Response 200

Returned on idempotent replay when the dispute already exists and the request is being replayed safely.

```json
{
  "dispute_id": "0e5ed19b-49cf-4515-bb9e-692c1c3bdf30",
  "status": "opened",
  "case_id": "0e4021e8-471f-456b-a0f3-f48a77176a04",
  "inbox_message_id": "3ce25d3d-093d-417c-8e05-9a6b34d8d714",
  "event_type": "card.dispute.opened.v1"
}
```

## Error responses

### 400
```json
{ "error": "missing_idempotency_key" }
```

```json
{ "error": "missing_space_id" }
```

```json
{ "error": "invalid_request" }
```

```json
{ "error": "missing_transaction_reference" }
```

### 404
```json
{ "error": "card_not_found" }
```

```json
{ "error": "authorization_not_found" }
```

### 409
```json
{ "error": "space_card_mismatch" }
```

```json
{ "error": "authorization_mismatch" }
```

### 500
```json
{
  "error": "internal_error",
  "message": "..."
}
```

## Event emitted

`card.dispute.opened.v1`

Example payload:

```json
{
  "dispute_id": "0e5ed19b-49cf-4515-bb9e-692c1c3bdf30",
  "space_id": "3cd1b39f-37d2-405d-aad0-c4758cb95003",
  "card_id": "41dc3791-c90b-49fd-8d34-247d4cf6151e",
  "authorization_id": "39f847c0-074f-498c-8eb2-375dc078245c",
  "capture_id": "6f099558-4efa-419d-a501-bc26bdbe0985",
  "settlement_id": "44150117-8f86-4f74-8ffd-577a29f2c12c",
  "reason_code": "fraud_card_not_present",
  "status": "opened"
}
```

## Operational notes

This flow is intentionally isolated from:
- authorization decisioning
- capture processing
- settlement posting
- ledger holds
- ledger postings

Dispute creation must remain operationally independent from the core payment execution path.
