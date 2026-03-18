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
  createGroupConversation,
} = require('../../../social/src/chat-core/usecases/createGroupConversation');
const {
  addConversationMember,
} = require('../../../social/src/chat-core/usecases/addConversationMember');
const {
  updateConversationMemberRole,
} = require('../../../social/src/chat-core/usecases/updateConversationMemberRole');
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
    const actorUserId = resolveActorUserId(req) || 'user-test-1';
    const spaceId = resolveSpaceId(req);
    const {
      type,
      peer_user_id: peerUserId,
      title,
      member_user_ids: memberUserIds,
    } = req.body || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(type, 'conversation_type_required', 'type is required');

    if (type === 'direct') {
      assertRequired(peerUserId, 'peer_user_id_required', 'peer_user_id is required');

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
    }

    if (type === 'group') {
      const result = await createGroupConversation({
        db: socialDb,
        conversationsRepo,
        conversationMembersRepo,
        membershipReader,
        publishEvent,
        actorUserId,
        spaceId,
        title,
        memberUserIds,
      });

      return res.status(201).json({
        conversation: result.conversation,
        members: result.members,
        created: result.created,
      });
    }

    const err = new Error('unsupported conversation type');
    err.code = 'unsupported_conversation_type';
    err.statusCode = 400;
    throw err;
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req) || 'user-test-1';
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
  '/:id/members',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req) || 'user-test-1';
    const spaceId = resolveSpaceId(req);
    const conversationId = req.params.id;

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(conversationId, 'conversation_id_required', 'conversation id is required');

    const conversation = await conversationsRepo.getById(socialDb, { conversationId });

    if (!conversation || conversation.space_id !== spaceId) {
      return res.status(404).json({
        error: 'conversation_not_found',
        message: 'conversation not found',
      });
    }

    const member = await conversationMembersRepo.getMember(socialDb, {
      conversationId,
      userId: actorUserId,
    });

    if (!member) {
      return res.status(403).json({
        error: 'conversation_membership_required',
        message: 'user is not a member of the conversation',
      });
    }

    const members = await conversationMembersRepo.listMembers(socialDb, {
      conversationId,
    });

    return res.status(200).json({ items: members });
  })
);

router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req) || 'user-test-1';
    const spaceId = resolveSpaceId(req);
    const conversationId = req.params.id;
    const { user_id: userId } = req.body || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(conversationId, 'conversation_id_required', 'conversation id is required');
    assertRequired(userId, 'user_id_required', 'user_id is required');

    const result = await addConversationMember({
      db: socialDb,
      conversationsRepo,
      conversationMembersRepo,
      membershipReader,
      actorUserId,
      conversationId,
      spaceId,
      userId,
    });

    return res.status(result.created ? 201 : 200).json(result);
  })
);

router.post(
  '/:id/members/:userId/role',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req) || 'user-test-1';
    const spaceId = resolveSpaceId(req);
    const conversationId = req.params.id;
    const targetUserId = req.params.userId;
    const { role } = req.body || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(conversationId, 'conversation_id_required', 'conversation id is required');
    assertRequired(targetUserId, 'user_id_required', 'user id is required');
    assertRequired(role, 'role_required', 'role is required');

    const result = await updateConversationMemberRole({
      db: socialDb,
      conversationsRepo,
      conversationMembersRepo,
      actorUserId,
      conversationId,
      spaceId,
      targetUserId,
      role,
    });

    return res.status(200).json(result);
  })
);

router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req) || 'user-test-1';
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
      next_cursor: result.nextCursor ?? null,
    });
  })
);

router.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const actorUserId = resolveActorUserId(req) || 'user-test-1';
    const spaceId = resolveSpaceId(req);
    const conversationId = req.params.id;
    const {
      message_type: messageType,
      body_text: bodyText,
      client_message_id: clientMessageId,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      attachment_size_bytes: attachmentSizeBytes,
      attachment_metadata: attachmentMetadata,
    } = req.body || {};

    assertRequired(actorUserId, 'actor_user_missing', 'Authenticated user is required', 401);
    assertRequired(spaceId, 'space_id_required', 'space_id is required');
    assertRequired(conversationId, 'conversation_id_required', 'conversation id is required');
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
      messageType,
      bodyText,
      clientMessageId,
      attachmentUrl,
      attachmentType,
      attachmentSizeBytes,
      attachmentMetadata,
    });

    return res.status(result.created ? 201 : 200).json(result);
  })
);

router.use((err, req, res, _next) => {
  const statusCode = Number.isInteger(err?.statusCode) ? err?.statusCode : 500;
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