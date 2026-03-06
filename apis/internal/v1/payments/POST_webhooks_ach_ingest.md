# POST /internal/v1/payments/webhooks/ach/ingest

Ingesta interna de webhooks ACH con arquitectura store-first, persistencia duradera, deduplicación por evento proveedor y mapping de estados externos a estados internos del dominio.

## Request body

```json
{
  "provider": "mock_ach",
  "provider_event_id": "evt_ach_001",
  "event_type": "transfer.status_changed",
  "occurred_at": "2026-03-06T10:15:00Z",
  "data": {
    "provider_transfer_id": "ach_1772820536198_9sxibb35",
    "status": "processing"
  },
  "signature": "optional"
}