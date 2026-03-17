async function listMessages({
  db,
  conversationsRepo,
  conversationMembersRepo,
  messagesRepo,
  actorUserId,
  conversationId,
  spaceId,
  limit,
  beforeCreatedAt,
}) {
  const conversation = await conversationsRepo.getById(db, { conversationId });

  if (!conversation) {
    const error = new Error('conversation not found');
    error.statusCode = 404;
    throw error;
  }

  if (conversation.space_id !== spaceId) {
    const error = new Error('conversation does not belong to requested space');
    error.statusCode = 403;
    throw error;
  }

  const isMember = await conversationMembersRepo.isMember(db, {
    conversationId,
    userId: actorUserId,
  });

  if (!isMember) {
    const error = new Error('user is not a member of the conversation');
    error.statusCode = 403;
    throw error;
  }

  return messagesRepo.listMessages(db, {
    conversationId,
    limit,
    beforeCreatedAt,
  });
}

module.exports = {
  listMessages,
};
