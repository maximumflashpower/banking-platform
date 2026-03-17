import test from "node:test";
import assert from "node:assert/strict";
import { validateSession } from "../src/sessions/validateSession.js";

test("validateSession accepts active valid session", async () => {
  const session = {
    status: "active",
    session_type: "social_session",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  assert.equal(validateSession(session, "social_session"), true);
});

test("validateSession rejects missing session", async () => {
  assert.throws(() => validateSession(null), /session_not_found/);
});

test("validateSession rejects inactive session", async () => {
  const session = {
    status: "invalidated",
    session_type: "social_session",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  assert.throws(() => validateSession(session), /session_not_active/);
});

test("validateSession rejects expired session", async () => {
  const session = {
    status: "active",
    session_type: "social_session",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };

  assert.throws(() => validateSession(session), /session_expired/);
});

test("validateSession rejects wrong type", async () => {
  const session = {
    status: "active",
    session_type: "social_session",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  assert.throws(
    () => validateSession(session, "financial_session"),
    /invalid_session_type/
  );
});