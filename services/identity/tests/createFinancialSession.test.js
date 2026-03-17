import test from "node:test";
import assert from "node:assert/strict";
import { createFinancialSession } from "../src/sessions/createFinancialSession.js";

test("createFinancialSession requires spaceId", async () => {
  const fakeDb = {
    async query() {
      throw new Error("should_not_be_called");
    },
  };

  await assert.rejects(
    async () => {
      await createFinancialSession({
        db: fakeDb,
        userId: "user-1",
      });
    },
    /space_id_required/
  );
});

test("createFinancialSession creates an active financial session", async () => {
  let capturedQuery = null;

  const fakeDb = {
    async query(sql, params) {
      capturedQuery = { sql, params };
      return {
        rows: [
          {
            id: "22222222-2222-2222-2222-222222222222",
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

  const session = await createFinancialSession({
    db: fakeDb,
    userId: "user-1",
    spaceId: "space-1",
    deviceId: "device-1",
  });

  assert.ok(capturedQuery);
  assert.equal(session.user_id, "user-1");
  assert.equal(session.session_type, "financial_session");
  assert.equal(session.space_id, "space-1");
  assert.equal(session.device_id, "device-1");
  assert.equal(session.status, "active");
  assert.ok(new Date(session.expires_at) > new Date());
});