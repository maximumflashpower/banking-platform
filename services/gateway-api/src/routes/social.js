'use strict';

const express = require('express');

const logger = require('../infrastructure/logger');
const socialDb = require('../infrastructure/socialDb');

const requireSession = require('../middleware/requireSession');

const conversationsRepo = require('../repos/social/conversationsRepo');
const conversationMembersRepo = require('../repos/social/conversationMembersRepo');
const messagesRepo = require('../repos/social/messagesRepo');
const membershipReader = require('../repos/identity/membershipReader');

const {
  createDirectConversation,
} = require('../../../social/src/chat-core/usecases/createDirectConversation');
const {
  listConversations,
} = require('../../../social/src/chat-core/usecases/listConversations');
const {
  sendMessage,
} = require('../../../social/src/chat-core/usecases/sendMessage');
const {
  listMessages,
} = require('../../../social/src/chat-core/usecases/listMessages');

const router = express.Router();

function resolveActorUserId(req) {
  return (
    req.requestContext?.userId ||
    req.requestContext?.actorUserId ||
    req.user?.id ||
    req.session?.user_id ||
    null
  );
}

function resolveSpaceId(req) {
  return (
    req.body?.space_id ||
    req.query?.space_id ||
    req.requestContext?.spaceId ||
    req.requestContext?.actorSpaceId ||
    null
  );
}

function assertRequired(value, code, message, statusCode = 400) {
  if (!value) {
    const err = new Error(message);
    err.code = code;
    err.statusCode = statusCode;
    throw err;
  }
}

async function publishEvent(topic, payload) {
  logger.info('social_event_published', {
    topic,
    payload,
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.use(requireSession);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req);
    const spaceId = resolveSpaceId(req);
    const { type, peer_user_id: peerUserId } = req.body || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(type, 'conversation_type_required', 'type is required');
    assertRequired(peerUserId, 'peer_user_id_required', 'peer_user_id is required');

    if (type !== 'direct') {
      const err = new Error('only direct conversations are supported in stage2a');
      err.code = 'unsupported_conversation_type';
      err.statusCode = 400;
      throw err;
    }

    const result = await createDirectConversation({
      db: socialDb,
      conversationsRepo,
      conversationMembersRepo,
      membershipReader,
      publishEvent,
      actorUserId,
      spaceId,
      peerUserId,
    });

    return res.status(result.created ? 201 : 200).json({
      conversation: result.conversation,
      members: result.members,
      created: result.created,
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req);
    const spaceId = resolveSpaceId(req);
    const { limit, before_updated_at: beforeUpdatedAt } = req.query || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');

    const items = await listConversations({
      db: socialDb,
      conversationsRepo,
      messagesRepo,
      membershipReader,
      actorUserId,
      spaceId,
      limit,
      beforeUpdatedAt,
    });

    return res.status(200).json({ items });
  })
);

router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req);
    const spaceId = resolveSpaceId(req);
    const conversationId = req.params.id;
    const { limit, cursor } = req.query || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(conversationId, 'conversation_id_required', 'conversation id is required');

    const result = await listMessages({
      db: socialDb,
      conversationsRepo,
      conversationMembersRepo,
      messagesRepo,
      actorUserId,
      conversationId,
      spaceId,
      limit,
      cursor,
    });

    return res.status(200).json({
      items: result.items,
      next_cursor: result.nextCursor,
    });
  })
);

router.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req);
    const spaceId = resolveSpaceId(req);
    const conversationId = req.params.id;
    const {
      body_text: bodyText,
      client_message_id: clientMessageId,
    } = req.body || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(conversationId, 'conversation_id_required', 'conversation id is required');
    assertRequired(bodyText, 'body_text_required', 'body_text is required');
    assertRequired(
      clientMessageId,
      'client_message_id_required',
      'client_message_id is required'
    );

    const result = await sendMessage({
      db: socialDb,
      conversationsRepo,
      conversationMembersRepo,
      messagesRepo,
      publishEvent,
      actorUserId,
      conversationId,
      spaceId,
      bodyText,
      clientMessageId,
    });

    return res.status(result.created ? 201 : 200).json(result);
  })
);

router.use((err, req, res, _next) => {
  const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  const errorCode = err?.code || 'request_failed';
  const message =
    statusCode >= 500
      ? 'Internal server error'
      : (err?.message || 'Request failed');

  logger.error('social_route_failed', {
    request_id: req.requestContext?.requestId || null,
    correlation_id: req.requestContext?.correlationId || null,
    method: req.method,
    path: req.originalUrl || req.url,
    status_code: statusCode,
    error_code: errorCode,
    error_message: err?.message || 'Unhandled social route error',
  });

  return res.status(statusCode).json({
    error: errorCode,
    message,
  });
});

module.exports = router;