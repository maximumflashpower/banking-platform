import test from "node:test";
import assert from "node:assert/strict";
import { createSocialSession } from "../src/sessions/createSocialSession.js";

test("createSocialSession creates an active social session", async () => {
  let capturedQuery = null;

  const fakeDb = {
    async query(sql, params) {
      capturedQuery = { sql, params };
      return {
        rows: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            user_id: params[0],
            session_type: params[1],
            space_id: params[2],
            device_id: params[3],
            expires_at: params[4],
            status: "active",
          },
        ],
      };
    },
  };

  const session = await createSocialSession({
    db: fakeDb,
    userId: "user-1",
    deviceId: "device-1",
  });

  assert.ok(capturedQuery);
  assert.equal(session.user_id, "user-1");
  assert.equal(session.session_type, "social_session");
  assert.equal(session.device_id, "device-1");
  assert.equal(session.status, "active");
  assert.ok(new Date(session.expires_at) > new Date());
});