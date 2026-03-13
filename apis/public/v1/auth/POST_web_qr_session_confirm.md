# POST /public/v1/web/qr/session/confirm
+
+Trusted mobile session confirms a pending QR request and activates the web session.
+
+## Request
+
+```json
+{
+  "sessionRequestId": "uuid",
+  "userId": "uuid",
+  "deviceIdWeb": "browser-device-id",
+  "spaceId": "uuid"
+}