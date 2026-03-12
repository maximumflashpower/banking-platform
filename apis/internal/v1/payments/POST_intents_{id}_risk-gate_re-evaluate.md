# POST /internal/v1/payments/intents/{id}/risk-gate/re-evaluate

Reevalúa el risk gate de un payment intent existente sin ejecutar rails.

## Request

```json
{
  "patch": {
    "amount_minor": 50000,
    "risk_context": {
      "velocity_1h_count": 4,
      "high_risk_counterparty": true
    }
  },
  "actor": {
    "type": "system",
    "id": "ops-risk-console"
  }
}