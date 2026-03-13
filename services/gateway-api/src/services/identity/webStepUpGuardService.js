'use strict';

const crypto = require('crypto');
const identityDb = require('../../infrastructure/identityDb');
const { createStepUpRepo } = require('../../repos/identity/stepUpRepo');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stepUpRepo = createStepUpRepo({ identityDb });

class WebStepUpGuardError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'WebStepUpGuardError';
    this.code = code;
    this.status = status;
  }
}

function ensureWebSessionId(webSessionId) {
  if (typeof webSessionId !== 'string' || !UUID_RE.test(webSessionId)) {
    throw new WebStepUpGuardError('web_session_id_invalid', 400);
  }
}

function ensureTargetType(targetType) {
  if (typeof targetType !== 'string' || !targetType.trim()) {
    throw new WebStepUpGuardError('step_up_required', 403);
  }
}

function ensureTargetId(targetId) {
  if (typeof targetId !== 'string' || !targetId.trim()) {
    throw new WebStepUpGuardError('step_up_required', 403);
  }
}

function isExpired(stepUpSession) {
  return Boolean(
    stepUpSession &&
    stepUpSession.expires_at &&
    new Date(stepUpSession.expires_at).getTime() <= Date.now()
  );
}

async function requireVerifiedStepUpForAction({ webSessionId, targetType, targetId }) {
  ensureWebSessionId(webSessionId);
  ensureTargetType(targetType);
  ensureTargetId(targetId);

  const latest = await stepUpRepo.findLatestStepUpForWebAction({
    webSessionId,
    targetType: targetType.trim(),
    targetId: targetId.trim()
  });

  if (!latest) {
    throw new WebStepUpGuardError('step_up_required', 403);
  }

  if (latest.consumed_at) {
    throw new WebStepUpGuardError('step_up_consumed', 403);
  }

  if (isExpired(latest)) {
    await stepUpRepo.expireVerifiedOrPendingStepUpSession({
      stepUpSessionId: latest.id,
      eventId: crypto.randomUUID(),
      reason: 'step_up_timeout'
    });

    throw new WebStepUpGuardError('step_up_expired', 403);
  }

  const verified = await stepUpRepo.findVerifiedStepUpForWebAction({
    webSessionId,
    targetType: targetType.trim(),
    targetId: targetId.trim()
  });

  if (!verified) {
    throw new WebStepUpGuardError('step_up_required', 403);
  }

  if (verified.consumed_at) {
    throw new WebStepUpGuardError('step_up_consumed', 403);
  }

  if (verified.invalidated_at) {
    throw new WebStepUpGuardError('step_up_required', 403);
  }

  if (isExpired(verified)) {
    await stepUpRepo.expireVerifiedOrPendingStepUpSession({
      stepUpSessionId: verified.id,
      eventId: crypto.randomUUID(),
      reason: 'step_up_timeout'
    });

    throw new WebStepUpGuardError('step_up_expired', 403);
  }

  return {
    stepUpSessionId: verified.id,
    webSessionId,
    targetType: verified.target_type,
    targetId: verified.target_id
  };
}

async function consumeVerifiedStepUp({ stepUpSessionId }) {
  if (typeof stepUpSessionId !== 'string' || !UUID_RE.test(stepUpSessionId)) {
    throw new WebStepUpGuardError('step_up_required', 403);
  }

  const consumed = await stepUpRepo.consumeVerifiedStepUpSession({
    stepUpSessionId,
    eventId: crypto.randomUUID()
  });

  if (!consumed) {
    throw new WebStepUpGuardError('step_up_consumed', 403);
  }

  return consumed;
}

module.exports = {
  WebStepUpGuardError,
  requireVerifiedStepUpForAction,
  consumeVerifiedStepUp
};