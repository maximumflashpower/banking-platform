"use strict";

const crypto = require("crypto");
const { query } = require("../infrastructure/postgres/db");

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clampInt(n, { min, max, def }) {
  const x = Number.isFinite(n) ? n : parseInt(String(n || ""), 10);
  if (!Number.isFinite(x)) return def;
  return Math.max(min, Math.min(max, x));
}

function parseIso(s) {
  if (!s) return null;
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isMember(members, userId) {
  return Array.isArray(members) && members.includes(String(userId));
}

function forbidden() {
  const err = new Error("forbidden");
  err.code = "FORBIDDEN";
  return err;
}

function rowToConversation(row, messagesOrNull, pageOrNull) {
  const base = {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    members: row.members || [],
  };
  if (Array.isArray(messagesOrNull)) base.messages = messagesOrNull;
  if (pageOrNull) base.page = pageOrNull;
  return base;
}

function rowToMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    text: row.text,
    createdAt: row.created_at.toISOString(),
  };
}

function requireSpace(spaceId) {
  const s = String(spaceId || "").trim();
  if (!s) throw forbidden();
  return s;
}

function requireUser(userId) {
  const u = String(userId || "").trim();
  if (!u) throw forbidden();
  return u;
}

/**
 * ETAPA 1: Conversaciones y mensajes siempre scopeados por space_id.
 * Requiere que las tablas tengan columna space_id.
 */

// POSTGRES returns jsonb as object/array in node-postgres
async function createConversation({ spaceId, members = [] } = {}) {
  const s = requireSpace(spaceId);
  const id = makeId("conv");
  const mem = Array.isArray(members) ? members.map(String) : [];

  const r = await query(
    "insert into conversations (id, space_id, members) values ($1, $2, $3::jsonb) returning id, created_at, members",
    [id, s, JSON.stringify(mem)]
  );

  return rowToConversation(r.rows[0], [], null);
}

// Cursor-based pagination for conversations.
// cursor: ISO string = "created_at" of last item from previous page.
async function listConversations({ spaceId, userId, limit = 50, cursor = null } = {}) {
  const s = requireSpace(spaceId);
  const u = requireUser(userId);

  const lim = clampInt(limit, { min: 1, max: 200, def: 50 });
  const curDate = parseIso(cursor);

  // Filter by membership: members @> '["u1"]'
  // AND by space_id
  // Order by created_at DESC
  let rows;
  if (curDate) {
    const r = await query(
      `
      select id, created_at, members
      from conversations
      where space_id = $1
        and members @> $2::jsonb
        and created_at < $3
      order by created_at desc
      limit $4
      `,
      [s, JSON.stringify([u]), curDate.toISOString(), lim]
    );
    rows = r.rows;
  } else {
    const r = await query(
      `
      select id, created_at, members
      from conversations
      where space_id = $1
        and members @> $2::jsonb
      order by created_at desc
      limit $3
      `,
      [s, JSON.stringify([u]), lim]
    );
    rows = r.rows;
  }

  const conversations = rows.map((row) => rowToConversation(row, null, null));

  const nextCursor =
    conversations.length > 0 ? conversations[conversations.length - 1].createdAt : null;

  return { conversations, nextCursor };
}

// Messages pagination: stable cursor "ISO|msg_id" (back-compat accepts ISO only).
async function getConversation(conversationId, { spaceId, userId, limit = 50, before = null } = {}) {
  const s = requireSpace(spaceId);
  const u = requireUser(userId);

  const c = await query(
    "select id, created_at, members from conversations where id=$1 and space_id=$2",
    [String(conversationId), s]
  );
  if (c.rowCount === 0) return null;

  const convRow = c.rows[0];
  const members = convRow.members || [];

  if (!isMember(members, u)) throw forbidden();

  const lim = clampInt(limit, { min: 1, max: 200, def: 50 });

  // Parse cursor: "ISO|msg_id" OR just "ISO"
  let beforeIso = null;
  let beforeId = null;
  if (before) {
    const raw = String(before);
    const parts = raw.split("|");
    beforeIso = parts[0] || null;
    beforeId = parts[1] || null;
  }
  const b = parseIso(beforeIso);

  let m;
  if (b && beforeId) {
    // Strictly older than (created_at, id) in DESC ordering
    m = await query(
      `
      select id, conversation_id, sender_id, text, created_at
      from messages
      where space_id = $1
        and conversation_id = $2
        and (created_at < $3 or (created_at = $3 and id < $4))
      order by created_at desc, id desc
      limit $5
      `,
      [s, String(conversationId), b.toISOString(), String(beforeId), lim]
    );
  } else if (b) {
    // Back-compat: ISO only
    m = await query(
      `
      select id, conversation_id, sender_id, text, created_at
      from messages
      where space_id = $1
        and conversation_id = $2
        and created_at < $3
      order by created_at desc, id desc
      limit $4
      `,
      [s, String(conversationId), b.toISOString(), lim]
    );
  } else {
    m = await query(
      `
      select id, conversation_id, sender_id, text, created_at
      from messages
      where space_id = $1
        and conversation_id = $2
      order by created_at desc, id desc
      limit $3
      `,
      [s, String(conversationId), lim]
    );
  }

  const messages = m.rows.map(rowToMessage);

  const nextBefore =
    messages.length > 0
      ? `${messages[messages.length - 1].createdAt}|${messages[messages.length - 1].id}`
      : null;

  return rowToConversation(
    convRow,
    // devolver en orden cronológico asc para UI-friendly (opcional)
    messages.slice().reverse(),
    { limit: lim, nextBefore }
  );
}

async function addMessage({ spaceId, conversationId, userId, text }) {
  const s = requireSpace(spaceId);
  const u = requireUser(userId);

  // membership check scoped by space
  const c = await query(
    "select members from conversations where id=$1 and space_id=$2",
    [String(conversationId), s]
  );
  if (c.rowCount === 0) return null;
  if (!isMember(c.rows[0].members || [], u)) throw forbidden();

  const id = makeId("msg");
  const t = String(text || "");

  // ETAPA 1: sender_id SIEMPRE es el userId autenticado
  const r = await query(
    `
    insert into messages (id, space_id, conversation_id, sender_id, text)
    values ($1, $2, $3, $4, $5)
    returning id, conversation_id, sender_id, text, created_at
    `,
    [id, s, String(conversationId), u, t]
  );

  return rowToMessage(r.rows[0]);
}

module.exports = { createConversation, listConversations, getConversation, addMessage };