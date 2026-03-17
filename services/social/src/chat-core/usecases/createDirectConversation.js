const crypto = require('crypto');

function buildDirectKey(userA, userB) {
  return [userA, userB].sort().join(':');
}

function assertRequired(value, name) {
  if (!value) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
}

async function createDirectConversation({
  db,
  conversationsRepo,
  conversationMembersRepo,
  membershipReader,
  publishEvent,
  actorUserId,
  spaceId,
  peerUserId,
}) {
  assertRequired(actorUserId, 'actorUserId');
  assertRequired(spaceId, 'spaceId');
  assertRequired(peerUserId, 'peerUserId');

  if (actorUserId === peerUserId) {
    const error = new Error('cannot create direct conversation with self');
    error.statusCode = 400;
    throw error;
  }

  const actorInSpace = await membershipReader.isUserInSpace({ userId: actorUserId, spaceId });
  const peerInSpace = await membershipReader.isUserInSpace({ userId: peerUserId, spaceId });

  if (!actorInSpace || !peerInSpace) {
    const error = new Error('all conversation participants must belong to the same space');
    error.statusCode = 403;
    throw error;
  }

  const directKey = buildDirectKey(actorUserId, peerUserId);
  const existing = await conversationsRepo.findDirectByKey(db, { spaceId, directKey });

  if (existing) {
    const members = await conversationMembersRepo.listMembers(db, {
      conversationId: existing.id,
    });

    return {
      conversation: existing,
      members,
      created: false,
    };
  }

  await db.query('BEGIN');

  try {
    const conversationId = crypto.randomUUID();

    const conversation = await conversationsRepo.createDirectConversation(db, {
      conversationId,
      spaceId,
      directKey,
      createdBy: actorUserId,
    });

    const members = await conversationMembersRepo.addMembers(db, {
      conversationId,
      spaceId,
      members: [
        { userId: actorUserId, memberRole: 'member' },
        { userId: peerUserId, memberRole: 'member' },
      ],
    });

    await db.query('COMMIT');

    if (publishEvent) {
      await publishEvent('social.chat.thread_created.v1', {
        event_id: crypto.randomUUID(),
        conversation_id: conversation.id,
        space_id: conversation.space_id,
        conversation_type: conversation.conversation_type,
        created_by: conversation.created_by,
        member_user_ids: members.map((item) => item.user_id),
        occurred_at: new Date().toISOString(),
      });
    }

    return {
      conversation,
      members,
      created: true,
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

module.exports = {
  createDirectConversation,
  buildDirectKey,
};
