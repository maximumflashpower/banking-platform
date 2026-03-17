'use strict';

async function addConversationMember({
  db,
  conversationsRepo,
  conversationMembersRepo,
  membershipReader,
  actorUserId,
  conversationId,
  spaceId,
  userId,
}) {
  const conversation = await conversationsRepo.getById(db, { conversationId });

  if (!conversation) {
    const error = new Error('conversation not found');
    error.statusCode = 404;
    error.code = 'conversation_not_found';
    throw error;
  }

  if (conversation.space_id !== spaceId) {
    const error = new Error('conversation does not belong to requested space');
    error.statusCode = 403;
    error.code = 'conversation_space_mismatch';
    throw error;
  }

  if (conversation.conversation_type !== 'group') {
    const error = new Error('member changes are only supported for group conversations');
    error.statusCode = 400;
    error.code = 'group_conversation_required';
    throw error;
  }

  const actorMember = await conversationMembersRepo.getMember(db, {
    conversationId,
    userId: actorUserId,
  });

  if (!actorMember || !['owner', 'admin'].includes(actorMember.member_role)) {
    const error = new Error('insufficient permissions to add members');
    error.statusCode = 403;
    error.code = 'group_member_add_forbidden';
    throw error;
  }

  const targetInSpace = await membershipReader.isUserInSpace({
    userId,
    spaceId,
  });

  if (!targetInSpace) {
    const error = new Error('target user is not a member of the requested space');
    error.statusCode = 403;
    error.code = 'member_space_mismatch';
    throw error;
  }

  const existing = await conversationMembersRepo.getMember(db, {
    conversationId,
    userId,
  });

  if (existing) {
    return {
      member: existing,
      created: false,
    };
  }

  const member = await conversationMembersRepo.addMember(db, {
    conversationId,
    spaceId,
    userId,
    memberRole: 'member',
  });

  return {
    member,
    created: true,
  };
}

module.exports = {
  addConversationMember,
};