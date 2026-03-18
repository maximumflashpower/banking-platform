'use strict';

const ALLOWED_MESSAGE_TYPES = new Set(['text', 'image', 'file', 'audio']);

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function validateMessagePayload(input) {
  const {
    message_type,
    body_text,
    attachment_url,
    attachment_type,
    attachment_size_bytes,
    attachment_metadata,
  } = input;

  if (!ALLOWED_MESSAGE_TYPES.has(message_type)) {
    const err = new Error('invalid message_type');
    err.statusCode = 400;
    throw err;
  }

  if (message_type === 'text') {
    if (isBlank(body_text)) {
      const err = new Error('body_text is required for text messages');
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  if (isBlank(attachment_url)) {
    const err = new Error('attachment_url is required for multimedia messages');
    err.statusCode = 400;
    throw err;
  }

  if (isBlank(attachment_type)) {
    const err = new Error('attachment_type is required for multimedia messages');
    err.statusCode = 400;
    throw err;
  }

  if (
    attachment_size_bytes !== undefined &&
    attachment_size_bytes !== null &&
    (!Number.isInteger(attachment_size_bytes) || attachment_size_bytes < 0)
  ) {
    const err = new Error('attachment_size_bytes must be a non-negative integer');
    err.statusCode = 400;
    throw err;
  }

  if (
    attachment_metadata !== undefined &&
    attachment_metadata !== null &&
    (typeof attachment_metadata !== 'object' || Array.isArray(attachment_metadata))
  ) {
    const err = new Error('attachment_metadata must be an object');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = function buildSendMessageWithAttachments({
  assertConversationMembership,
  messagesRepo,
}) {
  if (!assertConversationMembership) {
    throw new Error('assertConversationMembership is required');
  }

  if (!messagesRepo || typeof messagesRepo.insertMessage !== 'function') {
    throw new Error('messagesRepo.insertMessage is required');
  }

  return async function sendMessageWithAttachments(input) {
    const {
      actor_user_id,
      conversation_id,
      space_id,
      message_type,
      body_text,
      client_message_id,
      attachment_url,
      attachment_type,
      attachment_size_bytes,
      attachment_metadata,
    } = input;

    validateMessagePayload({
      message_type,
      body_text,
      attachment_url,
      attachment_type,
      attachment_size_bytes,
      attachment_metadata,
    });

    await assertConversationMembership({
      actor_user_id,
      conversation_id,
      space_id,
    });

    return messagesRepo.insertMessage({
      conversation_id,
      actor_user_id,
      space_id,
      message_type,
      body_text: body_text ?? null,
      client_message_id,
      attachment_url: attachment_url ?? null,
      attachment_type: attachment_type ?? null,
      attachment_size_bytes: attachment_size_bytes ?? null,
      attachment_metadata: attachment_metadata ?? null,
    });
  };
};