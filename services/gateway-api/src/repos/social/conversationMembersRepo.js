'use strict';

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

async function isMember(db, { conversationId, userId }) {
  const member = await getMember(db, { conversationId, userId });
  return Boolean(member);
}

async function addMember(db, { conversationId, spaceId, userId, memberRole }) {
  const result = await db.query(
    `
      INSERT INTO conversation_members (
        conversation_id,
        space_id,
        user_id,
        member_role
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (conversation_id, user_id)
      DO NOTHING
      RETURNING
        conversation_id,
        space_id,
        user_id,
        member_role,
        joined_at
    `,
    [conversationId, spaceId, userId, memberRole]
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  return getMember(db, { conversationId, userId });
}

async function addMembers(db, { conversationId, spaceId, members }) {
  const created = [];

  for (const member of members) {
    created.push(await addMember(db, {
      conversationId,
      spaceId,
      userId: member.userId,
      memberRole: member.memberRole,
    }));
  }

  return created;
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

async function updateMemberRole(db, { conversationId, userId, memberRole }) {
  const result = await db.query(
    `
      UPDATE conversation_members
      SET member_role = $3
      WHERE conversation_id = $1
        AND user_id = $2
      RETURNING
        conversation_id,
        space_id,
        user_id,
        member_role,
        joined_at
    `,
    [conversationId, userId, memberRole]
  );

  return result.rows[0] || null;
}

async function countMembersByRole(db, { conversationId, memberRole }) {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM conversation_members
      WHERE conversation_id = $1
        AND member_role = $2
    `,
    [conversationId, memberRole]
  );

  return result.rows[0]?.total || 0;
}

module.exports = {
  getMember,
  isMember,
  addMember,
  addMembers,
  listMembers,
  updateMemberRole,
  countMembersByRole,
};