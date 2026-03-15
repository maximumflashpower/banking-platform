'use strict';

const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function trimHeader(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

module.exports = function requestContext(req, res, next) {
  const requestId = trimHeader(req.header('X-Request-Id')) || uuid();
  const correlationId = trimHeader(req.header('X-Correlation-Id')) || requestId;

  req.requestContext = {
    requestId,
    correlationId,
    userId: trimHeader(req.header('X-User-Id')),
    spaceId: trimHeader(req.header('X-Space-Id')),
    sessionId: trimHeader(req.header('x-session-id')),
    webSessionId: trimHeader(req.header('x-web-session-id'))
  };

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);

  next();
};