# POST /public/v1/finance/payment-intents

Crea un payment intent y ejecuta el risk gate de Stage 6B antes de cualquier ejecución automática.

## Request

```json
{
  "space_id": "6f7e1d56-4d76-46d4-b3f2-1ca0fe57a1a8",
  "amount_minor": 15000,
  "currency": "USD",
  "rail": "ach",
  "source_account_id": "fbbd68a4-becf-46e6-a3bd-a35ab3f930c1",
  "destination_account_id": "82f2eb64-1eb7-4da4-8e08-4da12bb3340d",
  "memo": "Vendor payout",
  "risk_context": {
    "velocity_1h_count": 0,
    "high_risk_counterparty": false,
    "same_day_cashout": false
  }
}