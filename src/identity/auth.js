"use strict";

const crypto = require("crypto");
const { queryIdentity } = require("./identityDb");

// ETAPA 1 defaults
const SESSION_TTL_DAYS = 7;
const SCRYPT_N = 16384; // razonable para dev; sin deps externas
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function addDays(d, days) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function scryptHash(password, saltHex) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(saltHex, "hex");
    crypto.scrypt(
      String(password),
      salt,
      KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(Buffer.from(derivedKey));
      }
    );
  });
}

async function createPersonalSpaceIfMissing(userId) {
  // try insert (idempotente por unique(owner_user_id,type))
  const spaceId = makeId("space");
  await queryIdentity(
    `
    insert into spaces (id, owner_user_id, type)
    values ($1, $2, 'personal')
    on conflict (owner_user_id, type) do nothing
    `,
    [spaceId, userId]
  );

  // fetch actual personal space id
  const r = await queryIdentity(
    `select id, type, created_at from spaces where owner_user_id=$1 and type='personal' limit 1`,
    [userId]
  );
  if (r.rowCount === 0) throw new Error("personal_space_missing");
  return { id: r.rows[0].id, type: r.rows[0].type };
}

async function revokeAllUserSessions(userId) {
  await queryIdentity(
    `
    update sessions
    set revoked_at = now()
    where user_id = $1
      and revoked_at is null
    `,
    [userId]
  );
}

async function createSession({ userId, spaceId, deviceId }) {
  const sid = makeId("sess");
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS).toISOString();

  const r = await queryIdentity(
    `
    insert into sessions (id, user_id, space_id, device_id, expires_at)
    values ($1, $2, $3, $4, $5)
    returning id, user_id, space_id, created_at, expires_at
    `,
    [sid, userId, spaceId, String(deviceId || "web"), expiresAt]
  );

  return {
    id: r.rows[0].id,
    userId: r.rows[0].user_id,
    spaceId: r.rows[0].space_id,
    expiresAt: r.rows[0].expires_at,
  };
}

async function register({ email, password, deviceId = "web" }) {
  const emailNorm = normalizeEmail(email);
  const pw = String(password || "");

  if (!emailNorm) throw new Error("email_required");
  if (pw.length < 8) throw new Error("password_too_short");

  // check existing
  const existing = await queryIdentity(`select id from users where email_norm=$1 limit 1`, [emailNorm]);
  if (existing.rowCount > 0) throw new Error("email_in_use");

  const userId = makeId("usr");
  const saltHex = crypto.randomBytes(16).toString("hex");
  const hashBuf = await scryptHash(pw, saltHex);
  const hashHex = hashBuf.toString("hex");

  await queryIdentity(
    `
    insert into users (id, email, email_norm, password_hash, password_salt)
    values ($1, $2, $3, $4, $5)
    `,
    [userId, String(email).trim(), emailNorm, hashHex, saltHex]
  );

  const space = await createPersonalSpaceIfMissing(userId);

  // policy: 1 active session per user
  await revokeAllUserSessions(userId);

  const session = await createSession({ userId, spaceId: space.id, deviceId });

  return {
    user: { id: userId, email: String(email).trim() },
    space,
    session,
  };
}

async function login({ email, password, deviceId = "web" }) {
  const emailNorm = normalizeEmail(email);
  const pw = String(password || "");

  if (!emailNorm) throw new Error("email_required");
  if (!pw) throw new Error("password_required");

  const r = await queryIdentity(
    `select id, email, password_hash, password_salt from users where email_norm=$1 limit 1`,
    [emailNorm]
  );
  if (r.rowCount === 0) throw new Error("invalid_credentials");

  const u = r.rows[0];
  if (!u.password_hash || !u.password_salt) throw new Error("invalid_credentials");

  const derived = await scryptHash(pw, u.password_salt);
  const stored = Buffer.from(String(u.password_hash), "hex");

  // constant-time compare
  if (stored.length !== derived.length || !crypto.timingSafeEqual(stored, derived)) {
    throw new Error("invalid_credentials");
  }

  const space = await createPersonalSpaceIfMissing(u.id);

  // policy: 1 active session per user
  await revokeAllUserSessions(u.id);

  const session = await createSession({ userId: u.id, spaceId: space.id, deviceId });

  return {
    user: { id: u.id, email: u.email },
    space,
    session,
  };
}

async function validateSession(sid) {
  const sessionId = String(sid || "").trim();
  if (!sessionId) return null;

  const r = await queryIdentity(
    `
    select id, user_id, space_id, expires_at, revoked_at
    from sessions
    where id = $1
    limit 1
    `,
    [sessionId]
  );
  if (r.rowCount === 0) return null;

  const s = r.rows[0];
  if (s.revoked_at) return null;

  const expiresAt = new Date(s.expires_at);
  if (Number.isNaN(expiresAt.getTime())) return null;
  if (expiresAt <= new Date()) return null;

  if (!s.space_id) return null;

  return { sessionId: s.id, userId: s.user_id, spaceId: s.space_id, expiresAt: s.expires_at };
}

async function logout(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;

  await queryIdentity(
    `
    update sessions
    set revoked_at = now()
    where id = $1 and revoked_at is null
    `,
    [sid]
  );
}

async function getMe({ userId, spaceId }) {
  const uid = String(userId || "").trim();
  const sid = String(spaceId || "").trim();
  if (!uid || !sid) return null;

  const u = await queryIdentity(`select id, email, created_at from users where id=$1 limit 1`, [uid]);
  if (u.rowCount === 0) return null;

  const sp = await queryIdentity(
    `select id, type, created_at from spaces where id=$1 and owner_user_id=$2 limit 1`,
    [sid, uid]
  );
  if (sp.rowCount === 0) return null;

  return {
    user: { id: u.rows[0].id, email: u.rows[0].email, createdAt: u.rows[0].created_at.toISOString() },
    space: { id: sp.rows[0].id, type: sp.rows[0].type, createdAt: sp.rows[0].created_at.toISOString() },
  };
}

module.exports = { register, login, validateSession, logout, getMe };