"use strict";

const {
  createConversation,
  getConversation,
  listConversations,
  addMessage,
} = require("../store/memoryStore");

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function notFound(res) {
  return json(res, 404, { ok: false, error: "not_found" });
}

function badRequest(res, message) {
  return json(res, 400, { ok: false, error: "bad_request", message });
}

async function handleChat(req, res, url) {
  // POST /chat/conversations
  if (req.method === "POST" && url.pathname === "/chat/conversations") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return badRequest(res, "Invalid JSON");
    }
    const members = Array.isArray(body.members) ? body.members.map(String) : [];
    const conv = createConversation({ members });
    return json(res, 201, { ok: true, conversation: conv });
  }

  // GET /chat/conversations
  if (req.method === "GET" && url.pathname === "/chat/conversations") {
    return json(res, 200, { ok: true, conversations: listConversations() });
  }

  // GET /chat/conversations/:id
  if (req.method === "GET" && url.pathname.startsWith("/chat/conversations/")) {
    const id = url.pathname.split("/").pop();
    const conv = getConversation(id);
    if (!conv) return notFound(res);
    return json(res, 200, { ok: true, conversation: conv });
  }

  // POST /chat/send
  if (req.method === "POST" && url.pathname === "/chat/send") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return badRequest(res, "Invalid JSON");
    }

    const conversationId = body.conversationId ? String(body.conversationId) : "";
    const text = body.text ? String(body.text) : "";
    const senderId = body.senderId ? String(body.senderId) : "anonymous";

    if (!conversationId) return badRequest(res, "conversationId is required");
    if (!text.trim()) return badRequest(res, "text is required");

    const msg = addMessage(conversationId, { senderId, text });
    if (!msg) return notFound(res);

    return json(res, 201, { ok: true, message: msg });
  }

  return null; // no match
}

module.exports = { handleChat };
