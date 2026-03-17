'use strict';

async function updateConversationMemberRole({
  db,
  conversationsRepo,
  conversationMembersRepo,
  actorUserId,
  conversationId,
  spaceId,
  targetUserId,
  role,
}) {
  if (!['owner', 'admin', 'member'].includes(role)) {
    const error = new Error('invalid role');
    error.statusCode = 400;
    error.code = 'invalid_member_role';
    throw error;
  }

  const conversation = await conversationsRepo.getById(db, { conversationId });

  if (!conversation) {
    const error = new Error('conversation not found');
    error.statusCode = 404;
    error.code = 'conversation_not_found';
    throw error;
  }

  if (conversation.space_id !== spaceId || conversation.conversation_type !== 'group') {
    const error = new Error('group conversation required');
    error.statusCode = 400;
    error.code = 'group_conversation_required';
    throw error;
  }

  const actorMember = await conversationMembersRepo.getMember(db, {
    conversationId,
    userId: actorUserId,
  });

  if (!actorMember || actorMember.member_role !== 'owner') {
    const error = new Error('only owner can change member roles');
    error.statusCode = 403;
    error.code = 'group_role_change_forbidden';
    throw error;
  }

  const targetMember = await conversationMembersRepo.getMember(db, {
    conversationId,
    userId: targetUserId,
  });

  if (!targetMember) {
    const error = new Error('target member not found');
    error.statusCode = 404;
    error.code = 'group_member_not_found';
    throw error;
  }

  if (targetMember.member_role === 'owner' && role !== 'owner') {
    const owners = await conversationMembersRepo.countMembersByRole(db, {
      conversationId,
      memberRole: 'owner',
    });

    if (owners <= 1) {
      const error = new Error('group must retain at least one owner');
      error.statusCode = 400;
      error.code = 'group_last_owner_forbidden';
      throw error;
    }
  }

  const updatedMember = await conversationMembersRepo.updateMemberRole(db, {
    conversationId,
    userId: targetUserId,
    memberRole: role,
  });

  return {
    member: updatedMember,
  };
}

module.exports = {
  updateConversationMemberRole,
};
