"use strict";

function toUuid(id) {
  const s = String(id || "").trim();

  // Accept prefixed ids like "space_<uuid>"
  const maybe = s.includes("_") ? s.split("_").slice(1).join("_") : s;

  // Basic UUID v4-ish validation (good enough for dev)
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybe);
  if (!ok) throw new Error("invalid_uuid");
  return maybe;
}

module.exports = { toUuid };