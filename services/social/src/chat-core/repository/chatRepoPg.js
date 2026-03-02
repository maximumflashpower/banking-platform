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

function rowToConversation(row, messages) {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    members: row.members || [],
    ...(messages === null ? {} : { messages }),
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    text: row.text,
    createdAt: row.created_at.toISOString(),
  };
}

async function createConversation({ members = [] } = {}) {
  const id = makeId("conv");
  const r = await query(
    "insert into conversations(id, members) values ($1, $2::jsonb) returning id, created_at, members",
    [id, JSON.stringify(members)]
  );
  return rowToConversation(r.rows[0], []);
}

// Cursor-based pagination (created_at, id) for stability.
// cursor = ISO timestamp. Returns newest first.
async function listConversations({ limit = 20, cursor = null } = {}) {
  const lim = clampInt(limit, { min: 1, max: 100, def: 20 });
  const cur = parseIso(cursor);

  let r;
  if (cur) {
    r = await query(
      `select id, created_at, members
       from conversations
       where created_at < $1
       order by created_at desc
       limit $2`,
      [cur.toISOString(), lim]
    );
  } else {
    r = await query(
      `select id, created_at, members
       from conversations
       order by created_at desc
       limit $1`,
      [lim]
    );
  }

  const conversations = r.rows.map((row) => rowToConversation(row, null));
  const nextCursor =
    conversations.length > 0 ? conversations[conversations.length - 1].createdAt : null;

  return { conversations, nextCursor };
}

// Messages pagination: before=<ISO> returns messages strictly older than before.
// We fetch newest-first, then reverse to oldest->newest for UI.
async function getConversation(conversationId, { limit = 50, before = null } = {}) {
  const c = await query(
    "select id, created_at, members from conversations where id=$1",
    [conversationId]
  );
  if (c.rowCount === 0) return null;

  const lim = clampInt(limit, { min: 1, max: 200, def: 50 });
  const b = parseIso(before);

  let m;
  if (b) {
    m = await query(
      `select id, sender_id, text, created_at
       from messages
       where conversation_id=$1 and created_at < $2
       order by created_at desc
       limit $3`,
      [conversationId, b.toISOString(), lim]
    );
  } else {
    m = await query(
      `select id, sender_id, text, created_at
       from messages
       where conversation_id=$1
       order by created_at desc
       limit $2`,
      [conversationId, lim]
    );
  }

  const newestFirst = m.rows.map(rowToMessage);
  const messages = newestFirst.reverse();

  const nextBefore =
    messages.length > 0 ? messages[0].createdAt : null;

  return {
    ...rowToConversation(c.rows[0], messages),
    page: { limit: lim, nextBefore },
  };
}

async function addMessage({ conversationId, senderId, text }) {
  const id = makeId("msg");

  const c = await query("select 1 from conversations where id=$1", [conversationId]);
  if (c.rowCount === 0) return null;

  const r = await query(
    "insert into messages(id, conversation_id, sender_id, text) values ($1,$2,$3,$4) returning id, sender_id, text, created_at",
    [id, conversationId, senderId, text]
  );

  return rowToMessage(r.rows[0]);
}

module.exports = { createConversation, listConversations, getConversation, addMessage };
