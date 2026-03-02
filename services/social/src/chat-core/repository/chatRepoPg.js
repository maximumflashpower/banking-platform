"use strict";

const crypto = require("crypto");
const { query } = require("../infrastructure/postgres/db");

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
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

async function listConversations() {
  const r = await query(
    "select id, created_at, members from conversations order by created_at desc limit 50"
  );
  return r.rows.map((row) => rowToConversation(row, null));
}

async function getConversation(conversationId) {
  const c = await query(
    "select id, created_at, members from conversations where id=$1",
    [conversationId]
  );
  if (c.rowCount === 0) return null;

  const m = await query(
    "select id, sender_id, text, created_at from messages where conversation_id=$1 order by created_at asc",
    [conversationId]
  );

  return rowToConversation(c.rows[0], m.rows.map(rowToMessage));
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
