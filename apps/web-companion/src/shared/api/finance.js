import { http } from "./http.js";

export function getPaymentIntents(spaceId) {
  return http(`/public/v1/finance/payment-intents/${encodeURIComponent(spaceId)}`);
}

export function voteApproval(intentId, decision) {
  return http(`/public/v1/finance/approvals/${encodeURIComponent(intentId)}/vote`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}