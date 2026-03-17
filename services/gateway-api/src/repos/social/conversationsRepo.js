'use strict';

async function createConversation(db, {
  id,
  spaceId,
  conversationType,
  directKey,
  title,
  createdByUserId,
}) {
  const result = await db.query(
    `
      INSERT INTO conversations (
        id,
        space_id,
        conversation_type,
        direct_key,
        created_by,
        title,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        space_id,
        conversation_type,
        direct_key,
        created_by,
        title,
        created_by_user_id,
        created_at,
        updated_at
    `,
    [
      id,
      spaceId,
      conversationType,
      directKey,
      createdByUserId,
      title || null,
      createdByUserId || null,
    ]
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
        title,
        created_by_user_id,
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
        title,
        created_by_user_id,
        created_at,
        updated_at
    `,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function listByMember(db, {
  actorUserId,
  spaceId,
  limit = 50,
  beforeUpdatedAt = null,
}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const params = [actorUserId, spaceId, safeLimit];
  let beforeClause = '';

  if (beforeUpdatedAt) {
    params.splice(2, 0, beforeUpdatedAt);
    beforeClause = `AND c.updated_at < $3`;
  }

  const limitIndex = beforeUpdatedAt ? 4 : 3;

  const result = await db.query(
    `
      SELECT
        c.id,
        c.space_id,
        c.conversation_type,
        c.direct_key,
        c.created_by,
        c.title,
        c.created_by_user_id,
        c.created_at,
        c.updated_at
      FROM conversations c
      INNER JOIN conversation_members cm
        ON cm.conversation_id = c.id
      WHERE cm.user_id = $1
        AND c.space_id = $2
        ${beforeClause}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT $${limitIndex}
    `,
    params
  );

  return result.rows;
}

module.exports = {
  createConversation,
  getById,
  touchConversation,
  listByMember,
};