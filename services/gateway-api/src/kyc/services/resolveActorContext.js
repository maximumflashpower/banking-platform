'use strict';

function resolveActorContext(req) {
  const headerUserId =
    req.header('x-user-id') ||
    req.header('X-User-Id') ||
    null;

  const userId =
    req.auth?.userId ||
    req.identity?.userId ||
    req.requestContext?.user_id ||
    req.requestContext?.userId ||
    headerUserId ||
    'dev-user-stage3a1';

  return { userId };
}

module.exports = {
  resolveActorContext,
};