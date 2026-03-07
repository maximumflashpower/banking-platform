# POST /internal/v1/cards

Creates a card record in cards_db.

## Headers
- Content-Type: application/json
- Idempotency-Key: optional
- X-Correlation-Id: optional

## Request body
```json
{
  "card_token": "tok_card_001",
  "last4": "4242",
  "business_id": "biz_123",
  "user_id": "usr_123",
  "space_uuid": "11111111-1111-1111-1111-111111111111",
  "program_id": "prog_001",
  "brand": "visa",
  "network": "visa",
  "exp_month": 12,
  "exp_year": 2029,
  "cardholder_name": "Jose Bello",
  "metadata": {
    "source": "manual-stage5a"
  }
}