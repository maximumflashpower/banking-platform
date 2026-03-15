'use strict';

const logger = require('../../infrastructure/logger');
const immutableAuditRepo = require('../../repos/identity/immutableAuditRepo');

function getIp(req) {
  const forwarded = req.header('x-forwarded-for');
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function getUserAgent(req) {
  const ua = req.header('user-agent');
  return typeof ua === 'string' && ua.trim() ? ua.trim() : null;
}

function buildAuditEvent(req, payload) {
  return {
    request_id: req.requestContext?.requestId || null,
    correlation_id: payload.correlation_id || req.requestContext?.correlationId || null,
    actor_user_id:
      payload.actor_user_id || req.user?.id || req.session?.user_id || req.requestContext?.userId || null,
    actor_session_id:
      payload.actor_session_id || req.session?.session_id || req.requestContext?.sessionId || null,
    actor_space_id:
      payload.actor_space_id || req.session?.active_space_id || req.requestContext?.spaceId || null,
    actor_membership_id: payload.actor_membership_id || null,
    event_category: payload.event_category,
    event_type: payload.event_type,
    target_type: payload.target_type || null,
    target_id: payload.target_id || null,
    action: payload.action,
    result: payload.result,
    risk_level: payload.risk_level || null,
    reason: payload.reason || null,
    ip_address: payload.ip_address || getIp(req),
    user_agent: payload.user_agent || getUserAgent(req),
    route_method: req.method,
    route_path: req.originalUrl || req.url,
    http_status: Number.isInteger(payload.http_status) ? payload.http_status : null,
    metadata: payload.metadata || {},
  };
}

async function writeAuditEvent(req, payload) {
  const event = buildAuditEvent(req, payload);
  if (!event.request_id || !event.event_category || !event.event_type || !event.action || !event.result) {
    return null;
  }

  try {
    const row = await immutableAuditRepo.appendAuditEvent(event);
    logger.info('audit_event_appended', {
      request_id: event.request_id,
      correlation_id: event.correlation_id,
      event_category: event.event_category,
      event_type: event.event_type,
      audit_entry_id: row.id,
      target_type: event.target_type,
      target_id: event.target_id,
    });
    return row;
  } catch (error) {
    logger.error('audit_write_failed', {
      request_id: event.request_id,
      correlation_id: event.correlation_id,
      event_category: event.event_category,
      event_type: event.event_type,
      target_type: event.target_type,
      target_id: event.target_id,
      error_message: error?.message || 'audit write failed',
    });
    return null;
  }
}

async function writeSystemAuditEvent(payload) {
  if (
    !payload?.request_id ||
    !payload?.event_category ||
    !payload?.event_type ||
    !payload?.action ||
    !payload?.result
  ) {
    return null;
  }

  const event = {
    request_id: payload.request_id,
    correlation_id: payload.correlation_id || null,
    actor_user_id: payload.actor_user_id || null,
    actor_session_id: payload.actor_session_id || null,
    actor_space_id: payload.actor_space_id || null,
    actor_membership_id: payload.actor_membership_id || null,
    event_category: payload.event_category,
    event_type: payload.event_type,
    target_type: payload.target_type || null,
    target_id: payload.target_id || null,
    action: payload.action,
    result: payload.result,
    risk_level: payload.risk_level || null,
    reason: payload.reason || null,
    ip_address: payload.ip_address || null,
    user_agent: payload.user_agent || 'system/internal',
    route_method: payload.route_method || 'SYSTEM',
    route_path: payload.route_path || 'internal://system',
    http_status: Number.isInteger(payload.http_status) ? payload.http_status : null,
    metadata: payload.metadata || {},
  };

  try {
    const row = await immutableAuditRepo.appendAuditEvent(event);
    logger.info('system_audit_event_appended', {
      request_id: event.request_id,
      correlation_id: event.correlation_id,
      event_category: event.event_category,
      event_type: event.event_type,
      audit_entry_id: row.id,
      target_type: event.target_type,
      target_id: event.target_id,
    });
    return row;
  } catch (error) {
    logger.error('system_audit_write_failed', {
      request_id: event.request_id,
      correlation_id: event.correlation_id,
      event_category: event.event_category,
      event_type: event.event_type,
      target_type: event.target_type,
      target_id: event.target_id,
      error_message: error?.message || 'system audit write failed',
    });
    return null;
  }
}

async function writeRailKillSwitchBlockedEvent({
  requestId,
  correlationId = null,
  spaceId = null,
  targetType,
  targetId = null,
  rail,
  result = 'blocked',
  routeMethod = 'SYSTEM',
  routePath = 'internal://system',
  httpStatus = null,
  metadata = {},
}) {
  return writeSystemAuditEvent({
    request_id: requestId,
    correlation_id: correlationId,
    actor_space_id: spaceId,
    event_category: 'operations.resilience',
    event_type: 'rail.kill_switch.blocked',
    target_type: targetType,
    target_id: targetId,
    action: 'block',
    result,
    reason: `${rail}_rail_disabled`,
    route_method: routeMethod,
    route_path: routePath,
    http_status: httpStatus,
    metadata: {
      rail,
      degraded: true,
      ...metadata,
    },
  });
}

module.exports = {
  writeAuditEvent,
  writeSystemAuditEvent,
  writeRailKillSwitchBlockedEvent,
};