Está escrito como documentación técnica formal, sin pausas ni explicaciones intermedias, para que puedas incluirlo directamente en tu repositorio.

Stage 5F — Webhook Hardening Architecture
Overview

Stage 5F introduces a resilient event ingestion and processing architecture for card processor webhooks. The system guarantees durability, idempotency, replay safety, and tolerance to duplicate delivery and out-of-order events.

The design separates the acceptance of external events from the processing of business logic, preventing failures in downstream components from impacting webhook ingestion.

The architecture follows industry practices used by modern payment processors.

System Architecture
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
Webhook Intake Flow

When a webhook arrives:

Gateway API validates the payload.

The raw event is stored in cards_webhook_events.

A processing task is inserted into card_event_inbox.

The API returns 202 Accepted.

Processing happens asynchronously.

This guarantees that webhook ingestion never depends on downstream processing success.

Database Components
cards_webhook_events

Stores the raw event payload received from the processor.

Purpose:

forensic replay

debugging

audit

event history

Example structure:

id
provider
provider_event_id
event_type
payload
received_at
card_event_inbox

Transactional queue used by the worker to process events.

Important fields:

provider_event_id
event_type
process_status
process_attempts
last_error
claimed_by
claimed_at
received_at

Possible states:

pending
processing
processed
duplicate
deferred
failed_retryable
failed_terminal
card_authorizations

Represents approved authorization decisions for cards.

Key properties:

provider_auth_id
card_id
space_id
amount
currency
status
decision
decisioned_at

Captures must reference a valid authorization.

card_captures

Represents finalized captures.

Key constraints:

provider_capture_id UNIQUE
authorization_id FK → card_authorizations

This prevents:

duplicate capture creation

orphan captures without an authorization

card_pending_reversals

Temporary storage used when events arrive out of order.

Example scenario:

reversal arrives before capture

The reversal is stored in card_pending_reversals until the capture arrives.

cards_outbox

Transactional event publishing mechanism.

Events produced by domain logic are stored here and published asynchronously.

Purpose:

reliable event emission

decouple business transactions from message publishing

support at-least-once delivery

Webhook Processor

The worker runCardsWebhookProcessor continuously polls card_event_inbox.

Processing loop:

1 claim pending events
2 mark processing
3 call domain processor
4 update result state

Important parameters:

poll interval
batch size
max attempts

Example states:

pending → processing → processed
pending → processing → duplicate
pending → processing → failed_retryable
pending → processing → failed_terminal
Capture Processing Logic

Processor:

processCaptureReceived

Responsibilities:

1 validate payload
2 resolve authorization
3 detect duplicates
4 insert capture
5 reconcile pending reversals
6 emit domain events if needed

Pseudo flow:

lookup authorization
if not found → defer or fail

check existing capture by provider_capture_id
if exists → mark duplicate

insert capture

check pending reversals
if any → resolve them
Duplicate Protection

Duplicates can occur due to webhook retries.

Protection layers:

Event level
provider_event_id

Ensures the same webhook is not processed twice.

Domain level
provider_capture_id UNIQUE

Ensures that duplicate captures cannot be inserted even if the event is replayed.

Out-of-Order Event Handling

Processors may deliver events in different order.

Example:

capture
reversal

or

reversal
capture

To support this, the system uses:

card_pending_reversals

Workflow:

reversal arrives
capture not found
store pending reversal

capture later arrives
resolve pending reversal

This guarantees correctness regardless of delivery order.

Retry and Failure Handling

Each event tracks processing attempts.

process_attempts

Retry policy:

attempt < maxAttempts → retry
attempt ≥ maxAttempts → failed_terminal

Failure categories:

retryable
terminal
duplicate
deferred
Idempotency Guarantees

Replay safety is achieved through:

provider_event_id
provider_capture_id
database constraints

Replaying the same webhook results in:

duplicate state
no additional capture creation
Dispute Handling Isolation

Public disputes API:

POST /public/v1/cards/disputes

Creates:

card_disputes
cards_outbox
case_management records
financial_ops inbox messages

Important property:

Disputes do not directly affect the financial ledger.

This ensures separation between:

card network events
financial accounting
case management
Financial System Isolation

Core ledger remains independent from the webhook processing pipeline.

cards_db → operational card events
financial_db → accounting state

This prevents webhook failures from corrupting ledger state.

Observability and Monitoring

Recommended metrics:

cards_webhook_inbox_pending_total
cards_webhook_inbox_processing_total
cards_webhook_inbox_processed_total
cards_webhook_inbox_failed_terminal_total
cards_webhook_duplicate_events_total
cards_capture_created_total
cards_capture_duplicate_total
cards_pending_reversals_total
cards_outbox_pending_total
Operational Health Checks

Recommended monitoring:

worker heartbeat
oldest pending inbox event
oldest outbox event
retry spike detection
terminal failures rate
pending reversal age
Reliability Guarantees

The architecture provides:

Durable Intake

Webhook events are persisted before processing.

Asynchronous Processing

Business logic runs outside the HTTP request lifecycle.

Idempotent Execution

Duplicate events do not produce duplicate domain state.

Retry Safety

Temporary failures are retried safely.

Event Ordering Tolerance

Out-of-order deliveries do not corrupt state.

Domain Isolation

Cards domain is isolated from financial ledger.

Final Stage 5F Status

All webhook hardening requirements are satisfied.

durable intake ✔
async processing ✔
duplicate protection ✔
idempotency ✔
retry handling ✔
out-of-order tolerance ✔
domain isolation ✔
observability support ✔
Stage Result
Stage 5F — HARDENING COMPLETE

The system is now capable of processing card processor webhooks with the reliability standards expected in modern financial platforms.

## Stage 5F Closure Evidence

Validated final event:
- provider_event_id: evt-stage5f-final-001
- process_status: processed

Backups captured:
- backups/stage5f/cards_db_stage5f.dump
- backups/stage5f/financial_db_stage5f.dump

Closure notes:
- durable intake verified
- async processing verified
- duplicate detection verified
- retry control verified
- terminal failure handling verified
- capture persistence verified
- replay safety verified