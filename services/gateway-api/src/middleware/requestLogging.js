'use strict';

const logger = require('../infrastructure/logger');

module.exports = function requestLogging(req, res, next) {
  const startedAt = Date.now();

  logger.info('request_started', {
    request_id: req.requestContext?.requestId || null,
    correlation_id: req.requestContext?.correlationId || null,
    method: req.method,
    path: req.originalUrl || req.url,
    user_id: req.requestContext?.userId || null,
    space_id: req.requestContext?.spaceId || null,
    session_id: req.requestContext?.sessionId || null,
    web_session_id: req.requestContext?.webSessionId || null
  });

  res.on('finish', () => {
    logger.info('request_finished', {
      request_id: req.requestContext?.requestId || null,
      correlation_id: req.requestContext?.correlationId || null,
      method: req.method,
      path: req.originalUrl || req.url,
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
      user_id: req.requestContext?.userId || null,
      space_id: req.requestContext?.spaceId || null,
      session_id: req.requestContext?.sessionId || null,
      web_session_id: req.requestContext?.webSessionId || null
    });
  });

  next();
};