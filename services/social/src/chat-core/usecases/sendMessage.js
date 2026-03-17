'use strict';

const crypto = require('crypto');

function normalizeBodyText(bodyText) {
  return typeof bodyText === 'string' ? bodyText.trim() : '';
}

function normalizeClientMessageId(clientMessageId) {
  return typeof clientMessageId === 'string' ? clientMessageId.trim() : '';
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
  const normalizedClientMessageId = normalizeClientMessageId(clientMessageId);

  if (!normalizedBodyText) {
    const error = new Error('bodyText is required');
    error.statusCode = 400;
    error.code = 'body_text_required';
    throw error;
  }

  if (normalizedBodyText.length > 4000) {
    const error = new Error('bodyText exceeds maximum length');
    error.statusCode = 400;
    error.code = 'body_text_too_long';
    throw error;
  }

  if (!normalizedClientMessageId) {
    const error = new Error('clientMessageId is required');
    error.statusCode = 400;
    error.code = 'client_message_id_required';
    throw error;
  }

  if (normalizedClientMessageId.length > 100) {
    const error = new Error('clientMessageId exceeds maximum length');
    error.statusCode = 400;
    error.code = 'client_message_id_too_long';
    throw error;
  }

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

  let message;

  await db.query('BEGIN');

  try {
    message = await messagesRepo.createMessage(db, {
      messageId: crypto.randomUUID(),
      conversationId,
      spaceId,
      senderUserId: actorUserId,
      bodyText: normalizedBodyText,
      clientMessageId: normalizedClientMessageId,
    });

    if (message.inserted) {
      await conversationsRepo.touchConversation(db, { conversationId });
    }

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  if (message.inserted && publishEvent) {
    await publishEvent('social.chat.message_created.v1', {
      event_id: crypto.randomUUID(),
      message_id: message.id,
      conversation_id: message.conversation_id,
      space_id: message.space_id,
      sender_user_id: message.sender_user_id,
      message_type: message.message_type,
      body_text: message.body_text,
      created_at: message.created_at,
      client_message_id: message.client_message_id,
    });
  }

  return {
    message: {
      id: message.id,
      conversation_id: message.conversation_id,
      space_id: message.space_id,
      sender_user_id: message.sender_user_id,
      message_type: message.message_type,
      body_text: message.body_text,
      client_message_id: message.client_message_id,
      created_at: message.created_at,
    },
    created: Boolean(message.inserted),
  };
}

module.exports = {
  sendMessage,
};