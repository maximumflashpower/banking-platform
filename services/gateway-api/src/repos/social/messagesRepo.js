'use strict';

const {
  createMessage,
  findByClientMessageId,
  listMessages,
  getLastMessageForConversationIds,
} = require('../../../../social/src/chat-core/repository/messagesRepoPg');

module.exports = {
  createMessage,
  findByClientMessageId,
  listMessages,
  getLastMessageForConversationIds,
};