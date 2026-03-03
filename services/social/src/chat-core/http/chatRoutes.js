"use strict";

const {
  createConversation,
  getConversation,
  listConversations,
  addMessage,
} = require("../repository/chatRepoPg");

/**
 * ETAPA 1: Auth solo por sesión.
 * El Gateway debe setear:
 *   req.auth = { userId, spaceId, sessionId }
 * Si falta, se responde 401.
 */
function getAuth(req) {
  const userId = req?.auth?.userId ? String(req.auth.userId).trim() : "";
  const spaceId = req?.auth?.spaceId ? String(req.auth.spaceId).trim() : "";
  const sessionId = req?.auth?.sessionId ? String(req.auth.sessionId).trim() : "";
  return { userId, spaceId, sessionId };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
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

function unauthorized(res) {
  return json(res, 401, { ok: false, error: "unauthorized", message: "session required" });
}

function forbidden(res) {
  return json(res, 403, { ok: false, error: "forbidden" });
}

function clampInt(n, { min, max, def }) {
  const x = Number.isFinite(n) ? n : parseInt(String(n || ""), 10);
  if (!Number.isFinite(x)) return def;
  return Math.max(min, Math.min(max, x));
}

function getQueryParam(url, key) {
  const v = url.searchParams.get(key);
  return v === null ? null : String(v);
}

async function handleChat(req, res, url) {
  const { userId, spaceId } = getAuth(req);
  if (!userId || !spaceId) return unauthorized(res);

  // POST /chat/conversations  { members: ["u1","u2"] }
  // Nota: fuerza que el creator quede como miembro.
  if (req.method === "POST" && url.pathname === "/chat/conversations") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return badRequest(res, "Invalid JSON");
    }

    const raw = Array.isArray(body.members) ? body.members.map(String) : [];
    const membersSet = new Set([userId, ...raw.filter(Boolean)]);
    const members = Array.from(membersSet);

    // ETAPA 1: scoping por space_id
    const conv = await createConversation({ spaceId, members, createdBy: userId });
    return json(res, 201, { ok: true, conversation: conv });
  }

  // GET /chat/conversations?limit=50&cursor=<ISO>
  if (req.method === "GET" && url.pathname === "/chat/conversations") {
    const limit = clampInt(getQueryParam(url, "limit"), { min: 1, max: 200, def: 50 });
    const cursor = getQueryParam(url, "cursor");

    const { conversations, nextCursor } = await listConversations({ spaceId, userId, limit, cursor });
    return json(res, 200, { ok: true, conversations, nextCursor });
  }

  // GET /chat/conversations/:id?limit=50&before=<ISO|msg_id>
  if (req.method === "GET" && url.pathname.startsWith("/chat/conversations/")) {
    const id = url.pathname.split("/").pop();
    const limit = clampInt(getQueryParam(url, "limit"), { min: 1, max: 200, def: 50 });
    const before = getQueryParam(url, "before");

    try {
      const conv = await getConversation(id, { spaceId, userId, limit, before });
      if (!conv) return notFound(res);
      return json(res, 200, { ok: true, conversation: conv });
    } catch (e) {
      if (String(e && e.code) === "FORBIDDEN") return forbidden(res);
      throw e;
    }
  }

  // POST /chat/send  { conversationId, text }
  // ETAPA 1: senderId viene SIEMPRE de la sesión (userId), no del cliente.
  if (req.method === "POST" && url.pathname === "/chat/send") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return badRequest(res, "Invalid JSON");
    }

    const conversationId = body.conversationId ? String(body.conversationId) : "";
    const text = body.text ? String(body.text) : "";

    if (!conversationId) return badRequest(res, "conversationId is required");
    if (!text.trim()) return badRequest(res, "text is required");

    try {
      const msg = await addMessage({ spaceId, conversationId, userId, text });
      if (!msg) return notFound(res);

      const conv2 = await getConversation(conversationId, { spaceId, userId, limit: 50, before: null });
      return json(res, 200, { ok: true, conversation: conv2 });
    } catch (e) {
      if (String(e && e.code) === "FORBIDDEN") return forbidden(res);
      throw e;
    }
  }

  return null;
}

module.exports = { handleChat };