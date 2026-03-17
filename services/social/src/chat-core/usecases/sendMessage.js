const crypto = require('crypto');

function normalizeBodyText(bodyText) {
  return typeof bodyText === 'string' ? bodyText.trim() : '';
}

async function sendMessage({
  db,
  conversationsRepo,
  conversationMembersRepo,
  messagesRepo,
  publishEvent,
  actorUserId,
  conversationId,
  spaceId,
  bodyText,
  clientMessageId,
}) {
  const normalizedBodyText = normalizeBodyText(bodyText);

  if (!normalizedBodyText) {
    const error = new Error('bodyText is required');
    error.statusCode = 400;
    throw error;
  }

  if (normalizedBodyText.length > 4000) {
    const error = new Error('bodyText exceeds maximum length');
    error.statusCode = 400;
    throw error;
  }

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

  const member = await conversationMembersRepo.getMember(db, {
    conversationId,
    userId: actorUserId,
  });

  if (!member) {
    const error = new Error('user is not a member of the conversation');
    error.statusCode = 403;
    throw error;
  }

  const existing = await messagesRepo.findByClientMessageId(db, {
    conversationId,
    senderUserId: actorUserId,
    clientMessageId,
  });

  if (existing) {
    return {
      message: existing,
      created: false,
    };
  }

  await db.query('BEGIN');

  try {
    const message = await messagesRepo.createMessage(db, {
      messageId: crypto.randomUUID(),
      conversationId,
      spaceId,
      senderUserId: actorUserId,
      bodyText: normalizedBodyText,
      clientMessageId,
    });

    await conversationsRepo.touchConversation(db, { conversationId });

    await db.query('COMMIT');

    if (publishEvent) {
      await publishEvent('social.chat.message_created.v1', {
        event_id: crypto.randomUUID(),
        message_id: message.id,
        conversation_id: message.conversation_id,
        space_id: message.space_id,
        sender_user_id: message.sender_user_id,
        message_type: message.message_type,
        created_at: message.created_at,
      });
    }

    return {
      message,
      created: true,
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

module.exports = {
  sendMessage,
};
