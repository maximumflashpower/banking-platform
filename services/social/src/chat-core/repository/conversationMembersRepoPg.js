async function addMembers(db, { conversationId, spaceId, members }) {
  if (!Array.isArray(members) || members.length === 0) {
    return [];
  }

  const inserted = [];

  for (const member of members) {
    const result = await db.query(
      `
        INSERT INTO conversation_members (
          conversation_id,
          space_id,
          user_id,
          member_role
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        RETURNING
          conversation_id,
          space_id,
          user_id,
          member_role,
          joined_at
      `,
      [
        conversationId,
        spaceId,
        member.userId,
        member.memberRole || 'member',
      ]
    );

    if (result.rows[0]) {
      inserted.push(result.rows[0]);
    }
  }

  return inserted;
}

async function listMembers(db, { conversationId }) {
  const result = await db.query(
    `
      SELECT
        conversation_id,
        space_id,
        user_id,
        member_role,
        joined_at
      FROM conversation_members
      WHERE conversation_id = $1
      ORDER BY joined_at ASC, user_id ASC
    `,
    [conversationId]
  );

  return result.rows;
}

async function isMember(db, { conversationId, userId }) {
  const result = await db.query(
    `
      SELECT 1
      FROM conversation_members
      WHERE conversation_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [conversationId, userId]
  );

  return Boolean(result.rows[0]);
}

async function getMember(db, { conversationId, userId }) {
  const result = await db.query(
    `
      SELECT
        conversation_id,
        space_id,
        user_id,
        member_role,
        joined_at
      FROM conversation_members
      WHERE conversation_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [conversationId, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  addMembers,
  listMembers,
  isMember,
  getMember,
};
