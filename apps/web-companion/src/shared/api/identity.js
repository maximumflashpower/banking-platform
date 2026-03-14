import { http } from "./http.js";

export function getSpaces() {
  return http("/public/v1/identity/spaces");
}

export function switchSpace(spaceId) {
  return http("/public/v1/identity/spaces/switch", {
    method: "POST",
    body: JSON.stringify({ space_id: spaceId }),
  });
}