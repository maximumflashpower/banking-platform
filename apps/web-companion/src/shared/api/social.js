import { http } from "./http.js";

export function getConversations(spaceId) {
  return http(`/public/v1/social/conversations/${encodeURIComponent(spaceId)}`);
}