# Stage 7D — Web financial permissions with step-up enforcement

Stage 7D reuses the existing Stage 7C cross-device step-up flow and applies it
to sensitive web financial actions.

## Protected routes

- `POST /public/v1/finance/approvals/{intent_id}/vote`
- `POST /public/v1/identity/spaces/switch`

## Required web header

Protected web routes require:

- `x-web-session-id`

Errors:

- `web_session_id_required`
- `web_session_id_invalid`

## Binding rules

A compatible step-up must be bound to:

- `web_session_id`
- `target_type`
- `target_id`

### Payment approval binding

- `target_type = payment_intent_approve`
- `target_id = {intent_id}`

### Space switch binding

- `target_type = space_switch`
- `target_id = {space_id}`

## Valid step-up requirements

Before executing the protected action, the API requires a step-up session that is:

- `state = verified`
- not expired
- not consumed
- not invalidated

Errors:

- `step_up_required`
- `step_up_expired`
- `step_up_consumed`

If a pending or verified step-up is found expired during enforcement, it is
invalidated with:

- `invalidated_reason = step_up_timeout`

## Single-use

A verified step-up is consumed only after the protected operation succeeds.

This preserves:

- pre-verified mobile confirmation
- strict binding to the web action
- single-use enforcement for sensitive web operations