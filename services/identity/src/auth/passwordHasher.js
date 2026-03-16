import crypto from "crypto";

const PBKDF2_ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password) {

  if (!password || password.length < 8) {
    throw new Error("invalid_password");
  }

  const salt = crypto.randomBytes(16).toString("hex");

  const derivedKey = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");

  return `pbkdf2$${DIGEST}$${PBKDF2_ITERATIONS}$${salt}$${derivedKey}`;
}

export function verifyPassword(password, storedHash) {

  const [scheme, digest, iterationsRaw, salt, expected] =
    storedHash.split("$");

  if (scheme !== "pbkdf2") {
    throw new Error("unsupported_hash_scheme");
  }

  const iterations = Number(iterationsRaw);

  const actual = crypto
    .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, digest)
    .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex")
  );
}