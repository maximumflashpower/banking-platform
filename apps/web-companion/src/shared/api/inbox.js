import { http } from "./http.js";

export function getInbox(spaceId) {
  return http(`/public/v1/financial-inbox/inbox/${encodeURIComponent(spaceId)}`);
}

export function getInboxMessage(messageId) {
  return http(`/public/v1/financial-inbox/inbox/${encodeURIComponent(messageId)}`);
}

export function ackInboxMessage(messageId) {
  return http(`/public/v1/financial-inbox/inbox/${encodeURIComponent(messageId)}/ack`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}