# POST /public/v1/auth/step-up/verify

Verify a pending step-up challenge for a sensitive operation.

## Purpose

This endpoint completes step-up verification for an authenticated end-user after a step-up session has been started by an internal flow.

Typical use cases:

- approve large payments
- role changes
- limit changes
- other sensitive operations requiring fresh verification

## Authentication

Public API for authenticated users.

A valid logged-in session is required. The authenticated session must match the `step_up_session_id` owner.

## Headers

- `Content-Type: application/json`
- `Idempotency-Key: <required>`
- `X-Correlation-Id: <optional>`
- `X-Request-Id: <optional>`

## Request body

```json
{
  "step_up_session_id": "6e39caa0-c9d3-4b91-a11f-36d6a8111111",
  "verification_method": "otp",
  "otp_code": "123456",
  "device_id": "d3f1f19d-4c60-48b8-94da-713e6c121111"
}
```

## Request fields

- `step_up_session_id` required  
  Identifier of the target step-up session.

- `verification_method` required  
  Allowed values:
  - `otp`
  - `device`
  - `biometric`

- `otp_code` required when `verification_method = otp`

- `device_id` optional  
  Device context when available.

## Behavioral rules

- The endpoint is idempotent by `Idempotency-Key`.
- The target step-up session must exist and belong to the authenticated user.
- Only step-up sessions in `pending_verification` may be verified.
- If the session is expired, return an error and mark it `expired`.
- Failed attempts increment `attempts_count` and append a `verification_failed` event.
- Successful verification appends:
  - `verification_succeeded`
  - `step_up_verified`
- On success the session state becomes `verified`.
- If `max_attempts` is exceeded, the session becomes `cancelled`.

## Success response

HTTP `200 OK`

```json
{
  "ok": true,
  "step_up_session": {
    "id": "6e39caa0-c9d3-4b91-a11f-36d6a8111111",
    "state": "verified",
    "verification_method": "otp",
    "verified_at": "2026-03-05T22:00:00Z",
    "expires_at": "2026-03-05T22:05:00Z"
  }
}
```

## Invalid code response

HTTP `401 Unauthorized`

```json
{
  "ok": false,
  "error": {
    "code": "STEP_UP_INVALID_CODE",
    "message": "Verification failed"
  }
}
```

## Expired response

HTTP `410 Gone`

```json
{
  "ok": false,
  "error": {
    "code": "STEP_UP_EXPIRED",
    "message": "Step-up session has expired"
  }
}
```

## State conflict response

HTTP `409 Conflict`

```json
{
  "ok": false,
  "error": {
    "code": "STEP_UP_INVALID_STATE",
    "message": "Step-up session is not pending verification"
  }
}
```

## Validation error response

HTTP `400 Bad Request`

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_STEP_UP_REQUEST",
    "message": "verification_method is invalid"
  }
}
```

## Notes

- Verification only applies to the original purpose and target of the step-up session.
- A verified step-up session must not be reused for a different target object.
- Audit events should include actor, device, IP, and user-agent context when available.
