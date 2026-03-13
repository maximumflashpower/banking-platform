# POST /public/v1/web/qr/session/request
+
+Creates a short-lived pending web login request and returns a QR payload for the trusted mobile device.
+
+## Response
+
+```json
+{
+  "sessionRequestId": "uuid",
+  "qrPayload": "{\"type\":\"web_session_request\",...}",
+  "expiresAt": "2026-03-12T23:59:59.000Z"
+}