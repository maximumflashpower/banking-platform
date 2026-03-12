# POST /internal/v1/risk/sanctions-screenings/run

Runs sanctions screening for KYC, KYB, or beneficial owner subjects.

## Purpose

Sanctions screening foundation only.

This endpoint:
- records a screening in `risk_db`
- returns one of: `clear`, `potential_match`, `confirmed_match`
- creates a case only when outcome is `potential_match`

This endpoint does **not**:
- freeze accounts
- block transactions
- apply hard enforcement

## Request

```json
{
  "subject_type": "kyc_individual",
  "subject_id": "11111111-1111-1111-1111-111111111111",
  "screening_scope": "kyc",
  "subject_snapshot": {
    "full_name": "Jane Doe",
    "country": "US",
    "dob": "1990-01-01"
  },
  "matches": [
    {
      "entity_name": "Jane D.",
      "list_name": "OFAC SDN",
      "match_score": 78,
      "disposition": "potential_match"
    }
  ],
  "provider_reference": "screening-run-001"
}