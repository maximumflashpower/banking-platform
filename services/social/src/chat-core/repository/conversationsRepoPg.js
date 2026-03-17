function normalizeLimit(limit, fallback = 50, max = 100) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

async function findDirectByKey(db, { spaceId, directKey }) {
  const result = await db.query(
    `
      SELECT
        id,
        space_id,
        conversation_type,
        direct_key,
        created_by,
        created_at,
        updated_at
      FROM conversations
      WHERE space_id = $1
        AND conversation_type = 'direct'
        AND direct_key = $2
      LIMIT 1
    `,
    [spaceId, directKey]
  );

  return result.rows[0] || null;
}

async function createDirectConversation(db, { conversationId, spaceId, directKey, createdBy }) {
  const result = await db.query(
    `
      INSERT INTO conversations (
        id,
        space_id,
        conversation_type,
        direct_key,
        created_by
      )
      VALUES ($1, $2, 'direct', $3, $4)
      RETURNING
        id,
        space_id,
        conversation_type,
        direct_key,
        created_by,
        created_at,
        updated_at
    `,
    [conversationId, spaceId, directKey, createdBy]
  );

  return result.rows[0];
}

async function getById(db, { conversationId }) {
  const result = await db.query(
    `
      SELECT
        id,
        space_id,
        conversation_type,
        direct_key,
        created_by,
        created_at,
        updated_at
      FROM conversations
      WHERE id = $1
      LIMIT 1
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function touchConversation(db, { conversationId }) {
  const result = await db.query(
    `
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        space_id,
        conversation_type,
        direct_key,
        created_by,
        created_at,
        updated_at
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function listForUser(db, { spaceId, userId, limit, beforeUpdatedAt }) {
  const safeLimit = normalizeLimit(limit);
  const params = [spaceId, userId, safeLimit];
  let cursorSql = '';

  if (beforeUpdatedAt) {
    params.push(beforeUpdatedAt);
    cursorSql = `AND c.updated_at < $4`;
  }

  const result = await db.query(
    `
      SELECT
        c.id,
        c.space_id,
        c.conversation_type,
        c.direct_key,
        c.created_by,
        c.created_at,
        c.updated_at
      FROM conversations c
      INNER JOIN conversation_members cm
        ON cm.conversation_id = c.id
      WHERE c.space_id = $1
        AND cm.user_id = $2
        ${cursorSql}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT $3
    `,
    params
  );

  return result.rows;
}

module.exports = {
  findDirectByKey,
  createDirectConversation,
  getById,
  touchConversation,
  listForUser,
};
