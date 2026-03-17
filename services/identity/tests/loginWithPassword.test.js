import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/auth/passwordHasher.js";

test("hashPassword and verifyPassword roundtrip", async () => {
  const password = "StrongPass123!";
  const hash = hashPassword(password);

  assert.ok(hash.startsWith("pbkdf2$"));
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("WrongPass123!", hash), false);
});