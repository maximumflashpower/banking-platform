"use strict";

const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

// Estructura:
// conversations: Map<conversationId, { id, createdAt, members: string[], messages: Message[] }>
const conversations = new Map();

function createConversation({ members = [] } = {}) {
  const id = makeId("conv");
  const conv = {
    id,
    createdAt: nowIso(),
    members,
    messages: [],
  };
  conversations.set(id, conv);
  return conv;
}

function getConversation(id) {
  return conversations.get(id) || null;
}

function listConversations() {
  return Array.from(conversations.values()).map((c) => ({
    id: c.id,
    createdAt: c.createdAt,
    members: c.members,
    messagesCount: c.messages.length,
  }));
}

function addMessage(conversationId, { senderId, text }) {
  const conv = conversations.get(conversationId);
  if (!conv) return null;

  const msg = {
    id: makeId("msg"),
    conversationId,
    senderId: senderId || "anonymous",
    text: String(text || ""),
    createdAt: nowIso(),
  };

  conv.messages.push(msg);
  return msg;
}

module.exports = {
  createConversation,
  getConversation,
  listConversations,
  addMessage,
};
