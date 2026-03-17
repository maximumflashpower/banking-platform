const test = require("node:test");
const assert = require("node:assert/strict");
const { requireSessionType } = require("../src/middleware/requireSessionType.js");

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("requireSessionType rejects missing session", async () => {
  const middleware = requireSessionType("financial_session");
  const req = {};
  const res = createMockRes();

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "unauthorized" });
});

test("requireSessionType rejects wrong session type", async () => {
  const middleware = requireSessionType("financial_session");
  const req = {
    session: {
      session_type: "social_session",
    },
  };
  const res = createMockRes();

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "invalid_session_type" });
});

test("requireSessionType allows correct session type", async () => {
  const middleware = requireSessionType("financial_session");
  const req = {
    session: {
      session_type: "financial_session",
    },
  };
  const res = createMockRes();

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});