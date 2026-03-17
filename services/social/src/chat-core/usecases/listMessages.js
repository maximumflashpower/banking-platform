'use strict';

async function listMessages({
  db,
  conversationsRepo,
  conversationMembersRepo,
  messagesRepo,
  actorUserId,
  conversationId,
  spaceId,
  limit,
  cursor,
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

  const member = await conversationMembersRepo.getMember(db, {
    conversationId,
    userId: actorUserId,
  });

  if (!member) {
    const error = new Error('user is not a member of the conversation');
    error.statusCode = 403;
    error.code = 'conversation_membership_required';
    throw error;
  }

  return messagesRepo.listMessages(db, {
    conversationId,
    limit,
    cursor,
  });
}

module.exports = {
  listMessages,
};