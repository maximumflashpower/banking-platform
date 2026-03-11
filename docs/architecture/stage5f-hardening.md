Processor / Network
       │
       ▼
Gateway API
POST /internal/v1/cards/webhooks/financial
       │
       ▼
Durable Intake
cards_webhook_events
card_event_inbox
       │
       ▼
Async Worker
runCardsWebhookProcessor
       │
       ▼
Domain Processors
processCaptureReceived
processReversalReceived
       │
       ▼
Domain State
card_captures
card_pending_reversals
card_authorizations
       │
       ▼
Outbox
cards_outbox
       │
       ▼
Event Bus / Consumers