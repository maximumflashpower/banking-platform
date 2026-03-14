import { http } from "./http.js";

export function getWebSessionStatus() {
  return http("/public/v1/auth/web-session/status");
}

export function createQrSession() {
  return http("/public/v1/auth/web-companion/qr-session", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function verifyStepUp(payload) {
  return http("/public/v1/auth/step-up/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}