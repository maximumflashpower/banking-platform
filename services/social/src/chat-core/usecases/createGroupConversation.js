'use strict';

const crypto = require('crypto');

function normalizeTitle(title) {
  return typeof title === 'string' ? title.trim() : '';
}

function uniqueUserIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
}

async function createGroupConversation({
  db,
  conversationsRepo,
  conversationMembersRepo,
  membershipReader,
  publishEvent,
  actorUserId,
  spaceId,
  title,
  memberUserIds,
}) {
  const normalizedTitle = normalizeTitle(title);
  const uniqueMembers = uniqueUserIds(memberUserIds).filter((id) => id !== actorUserId);

  if (!normalizedTitle) {
    const error = new Error('title is required');
    error.statusCode = 400;
    error.code = 'group_title_required';
    throw error;
  }

  if (normalizedTitle.length > 120) {
    const error = new Error('title exceeds maximum length');
    error.statusCode = 400;
    error.code = 'group_title_too_long';
    throw error;
  }

  const actorInSpace = await membershipReader.isUserInSpace({
    userId: actorUserId,
    spaceId,
  });

  if (!actorInSpace) {
    const error = new Error('actor is not a member of the requested space');
    error.statusCode = 403;
    error.code = 'space_membership_required';
    throw error;
  }

  for (const userId of uniqueMembers) {
    const memberInSpace = await membershipReader.isUserInSpace({
      userId,
      spaceId,
    });

    if (!memberInSpace) {
      const error = new Error(`user ${userId} is not a member of the requested space`);
      error.statusCode = 403;
      error.code = 'member_space_mismatch';
      throw error;
    }
  }

  const conversationId = crypto.randomUUID();
  const allMembers = [actorUserId, ...uniqueMembers];

  await db.query('BEGIN');

  try {
    const conversation = await conversationsRepo.createConversation(db, {
      id: conversationId,
      spaceId,
      conversationType: 'group',
      directKey: null,
      title: normalizedTitle,
      createdByUserId: actorUserId,
    });

    await conversationMembersRepo.addMembers(db, {
      conversationId,
      spaceId,
      members: allMembers.map((userId) => ({
        userId,
        memberRole: userId === actorUserId ? 'owner' : 'member',
      })),
    });

    await db.query('COMMIT');

    if (publishEvent) {
      await publishEvent('social.chat.thread_created.v1', {
        event_id: crypto.randomUUID(),
        conversation_id: conversation.id,
        space_id: conversation.space_id,
        conversation_type: conversation.conversation_type,
        title: conversation.title,
        created_by_user_id: actorUserId,
      });
    }

    const members = await conversationMembersRepo.listMembers(db, { conversationId });

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
  createGroupConversation,
};