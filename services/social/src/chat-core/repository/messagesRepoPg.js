function normalizeLimit(limit, fallback = 50, max = 100) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

async function createMessage(db, {
  messageId,
  conversationId,
  spaceId,
  senderUserId,
  bodyText,
  clientMessageId = null,
}) {
  const result = await db.query(
    `
      INSERT INTO messages (
        id,
        conversation_id,
        space_id,
        sender_user_id,
        message_type,
        body_text,
        client_message_id
      )
      VALUES ($1, $2, $3, $4, 'text', $5, $6)
      RETURNING
        id,
        conversation_id,
        space_id,
        sender_user_id,
        message_type,
        body_text,
        client_message_id,
        created_at
    `,
    [
      messageId,
      conversationId,
      spaceId,
      senderUserId,
      bodyText,
      clientMessageId,
    ]
  );

  return result.rows[0];
}

async function findByClientMessageId(db, {
  conversationId,
  senderUserId,
  clientMessageId,
}) {
  if (!clientMessageId) {
    return null;
  }

  const result = await db.query(
    `
      SELECT
        id,
        conversation_id,
        space_id,
        sender_user_id,
        message_type,
        body_text,
        client_message_id,
        created_at
      FROM messages
      WHERE conversation_id = $1
        AND sender_user_id = $2
        AND client_message_id = $3
      LIMIT 1
    `,
    [conversationId, senderUserId, clientMessageId]
  );

  return result.rows[0] || null;
}

async function listMessages(db, { conversationId, limit, beforeCreatedAt }) {
  const safeLimit = normalizeLimit(limit);
  const params = [conversationId, safeLimit];
  let cursorSql = '';

  if (beforeCreatedAt) {
    params.push(beforeCreatedAt);
    cursorSql = `AND created_at < $3`;
  }

  const result = await db.query(
    `
      SELECT
        id,
        conversation_id,
        space_id,
        sender_user_id,
        message_type,
        body_text,
        client_message_id,
        created_at
      FROM messages
      WHERE conversation_id = $1
        ${cursorSql}
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    params
  );

  return result.rows.reverse();
}

async function getLastMessageForConversationIds(db, { conversationIds }) {
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return new Map();
  }

  const result = await db.query(
    `
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.id,
        m.sender_user_id,
        m.body_text,
        m.created_at
      FROM messages m
      WHERE m.conversation_id = ANY($1::uuid[])
      ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
    `,
    [conversationIds]
  );

  return new Map(result.rows.map((row) => [row.conversation_id, row]));
}

module.exports = {
  createMessage,
  findByClientMessageId,
  listMessages,
  getLastMessageForConversationIds,
};
