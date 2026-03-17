async function listConversations({
  db,
  conversationsRepo,
  messagesRepo,
  membershipReader,
  actorUserId,
  spaceId,
  limit,
  beforeUpdatedAt,
}) {
  const actorInSpace = await membershipReader.isUserInSpace({ userId: actorUserId, spaceId });

  if (!actorInSpace) {
    const error = new Error('user is not a member of the requested space');
    error.statusCode = 403;
    throw error;
  }

  const conversations = await conversationsRepo.listForUser(db, {
    spaceId,
    userId: actorUserId,
    limit,
    beforeUpdatedAt,
  });

  const lastMessagesByConversationId = await messagesRepo.getLastMessageForConversationIds(db, {
    conversationIds: conversations.map((item) => item.id),
  });

  return conversations.map((conversation) => {
    const lastMessage = lastMessagesByConversationId.get(conversation.id) || null;

    return {
      ...conversation,
      last_message_preview: lastMessage ? lastMessage.body_text : null,
      last_message_at: lastMessage ? lastMessage.created_at : null,
    };
  });
}

module.exports = {
  listConversations,
};
