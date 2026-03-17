'use strict';

const {
  createMessage,
  listMessages,
  getLastMessageForConversationIds,
} = require('../../../../social/src/chat-core/repository/messagesRepoPg');

module.exports = {
  createMessage,
  listMessages,
  getLastMessageForConversationIds,
};