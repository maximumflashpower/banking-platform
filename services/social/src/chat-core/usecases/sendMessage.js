'use strict';

const crypto = require('crypto');

const ALLOWED_MESSAGE_TYPES = new Set(['text', 'image', 'file', 'audio']);

function normalizeBodyText(bodyText) {
  return typeof bodyText === 'string' ? bodyText.trim() : '';
}

function normalizeClientMessageId(clientMessageId) {
  return typeof clientMessageId === 'string' ? clientMessageId.trim() : '';
}

function normalizeMessageType(messageType) {
  return typeof messageType === 'string' ? messageType.trim().toLowerCase() : 'text';
}

function normalizeAttachmentUrl(attachmentUrl) {
  return typeof attachmentUrl === 'string' ? attachmentUrl.trim() : '';
}

function normalizeAttachmentType(attachmentType) {
  return typeof attachmentType === 'string' ? attachmentType.trim() : '';
}

function normalizeAttachmentSizeBytes(attachmentSizeBytes) {
  if (attachmentSizeBytes === undefined || attachmentSizeBytes === null || attachmentSizeBytes === '') {
    return null;
  }

  const parsed = Number(attachmentSizeBytes);

  if (!Number.isInteger(parsed) || parsed < 0) {
    const error = new Error('attachmentSizeBytes must be a non-negative integer');
    error.statusCode = 400;
    error.code = 'attachment_size_bytes_invalid';
    throw error;
  }

  return parsed;
}

function normalizeAttachmentMetadata(attachmentMetadata) {
  if (attachmentMetadata === undefined) {
    return null;
  }

  if (attachmentMetadata === null) {
    return null;
  }

  if (typeof attachmentMetadata !== 'object' || Array.isArray(attachmentMetadata)) {
    const error = new Error('attachmentMetadata must be an object');
    error.statusCode = 400;
    error.code = 'attachment_metadata_invalid';
    throw error;
  }

  return attachmentMetadata;
}

function validateMessagePayload({
  messageType,
  bodyText,
  clientMessageId,
  attachmentUrl,
  attachmentType,
}) {
  if (!ALLOWED_MESSAGE_TYPES.has(messageType)) {
    const error = new Error('messageType is invalid');
    error.statusCode = 400;
    error.code = 'message_type_invalid';
    throw error;
  }

  if (!clientMessageId) {
    const error = new Error('clientMessageId is required');
    error.statusCode = 400;
    error.code = 'client_message_id_required';
    throw error;
  }

  if (clientMessageId.length > 100) {
    const error = new Error('clientMessageId exceeds maximum length');
    error.statusCode = 400;
    error.code = 'client_message_id_too_long';
    throw error;
  }

  if (messageType === 'text') {
    if (!bodyText) {
      const error = new Error('bodyText is required');
      error.statusCode = 400;
      error.code = 'body_text_required';
      throw error;
    }

    if (bodyText.length > 4000) {
      const error = new Error('bodyText exceeds maximum length');
      error.statusCode = 400;
      error.code = 'body_text_too_long';
      throw error;
    }

    return;
  }

  if (!attachmentUrl) {
    const error = new Error('attachmentUrl is required');
    error.statusCode = 400;
    error.code = 'attachment_url_required';
    throw error;
  }

  if (!attachmentType) {
    const error = new Error('attachmentType is required');
    error.statusCode = 400;
    error.code = 'attachment_type_required';
    throw error;
  }

  if (bodyText && bodyText.length > 4000) {
    const error = new Error('bodyText exceeds maximum length');
    error.statusCode = 400;
    error.code = 'body_text_too_long';
    throw error;
  }
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
  messageType,
  bodyText,
  clientMessageId,
  attachmentUrl,
  attachmentType,
  attachmentSizeBytes,
  attachmentMetadata,
}) {
  const normalizedMessageType = normalizeMessageType(messageType);
  const normalizedBodyText = normalizeBodyText(bodyText);
  const normalizedClientMessageId = normalizeClientMessageId(clientMessageId);
  const normalizedAttachmentUrl = normalizeAttachmentUrl(attachmentUrl);
  const normalizedAttachmentType = normalizeAttachmentType(attachmentType);
  const normalizedAttachmentSizeBytes = normalizeAttachmentSizeBytes(attachmentSizeBytes);
  const normalizedAttachmentMetadata = normalizeAttachmentMetadata(attachmentMetadata);

  validateMessagePayload({
    messageType: normalizedMessageType,
    bodyText: normalizedBodyText,
    clientMessageId: normalizedClientMessageId,
    attachmentUrl: normalizedAttachmentUrl,
    attachmentType: normalizedAttachmentType,
  });

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
      messageType: normalizedMessageType,
      bodyText: normalizedBodyText || null,
      clientMessageId: normalizedClientMessageId,
      attachmentUrl: normalizedAttachmentUrl || null,
      attachmentType: normalizedAttachmentType || null,
      attachmentSizeBytes: normalizedAttachmentSizeBytes,
      attachmentMetadata: normalizedAttachmentMetadata,
    });

	console.log('SEND MESSAGE INPUT', {
	  actorUserId,
	  conversationId,
	  spaceId,
	  messageType,
	  clientMessageId,
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
      attachment_url: message.attachment_url,
      attachment_type: message.attachment_type,
      attachment_size_bytes: message.attachment_size_bytes,
      attachment_metadata: message.attachment_metadata,
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
      attachment_url: message.attachment_url,
      attachment_type: message.attachment_type,
      attachment_size_bytes: message.attachment_size_bytes,
      attachment_metadata: message.attachment_metadata,
      client_message_id: message.client_message_id,
      created_at: message.created_at,
    },
    created: Boolean(message.inserted),
  };
}

module.exports = {
  sendMessage,
};