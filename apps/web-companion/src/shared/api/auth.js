import { http } from "./http.js";

export function createQrSession(deviceIdWeb) {
  return http("/public/v1/web/qr/session/request", {
    method: "POST",
    body: JSON.stringify({ deviceIdWeb }),
  });
}

export function confirmQrSession({
  sessionRequestId,
  deviceIdWeb,
  spaceId,
  mobileSessionId,
}) {
  return http("/public/v1/web/qr/session/confirm", {
    method: "POST",
    headers: {
      "x-session-id": mobileSessionId,
    },
    body: JSON.stringify({
      sessionRequestId,
      deviceIdWeb,
      spaceId,
    }),
  });
}

export function getWebSessionStatus(sessionRequestId) {
  return http(
    `/public/v1/web/session/status?sessionRequestId=${encodeURIComponent(
      sessionRequestId
    )}`
  );
}

export function requestStepUp(payload) {
  return http("/public/v1/auth/step-up/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmStepUp(payload) {
  return http("/public/v1/auth/step-up/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}