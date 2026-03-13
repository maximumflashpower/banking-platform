'use strict';

const {
  WebStepUpGuardError,
  requireVerifiedStepUpForAction
} = require('../services/identity/webStepUpGuardService');

module.exports = function requireVerifiedWebStepUp({ getTargetType, getTargetId }) {
  if (typeof getTargetType !== 'function') {
    throw new Error('getTargetType_required');
  }

  if (typeof getTargetId !== 'function') {
    throw new Error('getTargetId_required');
  }

  return async function requireVerifiedWebStepUpMiddleware(req, res, next) {
    try {
      const webSessionId = req.header('x-web-session-id');

      if (!webSessionId) {
        return res.status(400).json({ error: 'web_session_id_required' });
      }

      const targetType = await Promise.resolve(getTargetType(req));
      const targetId = await Promise.resolve(getTargetId(req));

      const stepUp = await requireVerifiedStepUpForAction({
        webSessionId,
        targetType,
        targetId
      });

      req.stepUp = {
        stepUpSessionId: stepUp.stepUpSessionId,
        webSessionId: stepUp.webSessionId,
        targetType: stepUp.targetType,
        targetId: stepUp.targetId
      };

      return next();
    } catch (error) {
      if (error instanceof WebStepUpGuardError) {
        return res.status(error.status).json({ error: error.code });
      }

      return next(error);
    }
  };
};