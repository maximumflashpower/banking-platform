'use strict';

const crypto = require('crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 900;
const PURPOSE = 'cross_device_step_up';

class StepUpError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.name = 'StepUpError';
    this.code = code;
    this.status = status;
  }
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function ensureUuid(value, code) {
  if (!isUuid(value)) {
    throw new StepUpError(code, 400, code);
  }
}

function ensureText(value, code) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new StepUpError(code, 400, code);
  }
}

function normalizeTtlSeconds(value) {
  const ttl = Number(value);

  if (!Number.isFinite(ttl) || ttl <= 0) {
    return DEFAULT_TTL_SECONDS;
  }

  return Math.min(Math.floor(ttl), MAX_TTL_SECONDS);
}

function asDate(now, ttlSeconds) {
  return new Date(now.getTime() + (ttlSeconds * 1000));
}

function ensureWebSessionActive(webSession) {
  if (!webSession) {
    throw new StepUpError('web_session_not_found', 404, 'web_session_not_found');
  }

  if (webSession.status !== 'active') {
    throw new StepUpError('web_session_not_active', 409, 'web_session_not_active');
  }

  if (webSession.invalidated_at) {
    throw new StepUpError('web_session_not_active', 409, 'web_session_not_active');
  }

  if (webSession.expires_at && new Date(webSession.expires_at).getTime() <= Date.now()) {
    throw new StepUpError('web_session_not_active', 409, 'web_session_not_active');
  }
}

function createStepUpService({ stepUpRepo, now = () => new Date() }) {
  if (!stepUpRepo) {
    throw new Error('stepUpRepo_required');
  }

  async function requestCrossDeviceStepUp(input) {
    ensureUuid(input.webSessionId, 'web_session_id_invalid');
    ensureText(input.spaceId, 'space_id_invalid');
    ensureText(input.actionType, 'action_type_invalid');
    ensureText(input.actionReferenceId, 'action_reference_id_invalid');
    ensureText(input.deviceIdWeb, 'device_id_web_invalid');

    const webSession = await stepUpRepo.findWebSessionForStepUp(input.webSessionId);
    ensureWebSessionActive(webSession);

    if (String(webSession.active_space_id || '') !== String(input.spaceId)) {
      throw new StepUpError('space_mismatch', 409, 'space_mismatch');
    }

    if (
      webSession.device_id_web &&
      String(webSession.device_id_web) !== String(input.deviceIdWeb)
    ) {
      throw new StepUpError('device_id_web_mismatch', 409, 'device_id_web_mismatch');
    }

    const pending = await stepUpRepo.findPendingStepUpForAction({
      webSessionId: webSession.session_id,
      purpose: PURPOSE,
      targetType: input.actionType.trim(),
      targetId: input.actionReferenceId.trim()
    });

    if (pending) {
      await stepUpRepo.cancelPendingStepUpSession({
        stepUpSessionId: pending.id,
        eventId: crypto.randomUUID(),
        reason: 'superseded',
        actorId: webSession.user_id
      });
    }

    const ttlSeconds = normalizeTtlSeconds(input.ttlSeconds);
    const expiresAt = asDate(now(), ttlSeconds).toISOString();
    const stepUpSessionId = crypto.randomUUID();

    const created = await stepUpRepo.createStepUpSession({
      stepUpSessionId,
      createdEventId: crypto.randomUUID(),
      requestedEventId: crypto.randomUUID(),
      createdEventIdempotencyKey: `step_up_created:${stepUpSessionId}`,
      requestedEventIdempotencyKey: `verification_requested:${stepUpSessionId}`,
      webSessionId: webSession.session_id,
      userId: webSession.user_id,
      businessId: input.spaceId.trim(),
      purpose: PURPOSE,
      targetType: input.actionType.trim(),
      targetId: input.actionReferenceId.trim(),
      deviceIdWeb: input.deviceIdWeb.trim(),
      expiresAt,
      idempotencyKey: `step_up_session:${stepUpSessionId}`,
      correlationId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      reason: input.reason || null,
      createdBy: webSession.user_id,
      updatedBy: webSession.user_id
    });

    return {
      stepUpSessionId: created.id,
      status: created.state,
      expiresAt: created.expires_at,
      webSessionId: created.web_session_id || created.session_id,
      actionType: created.target_type,
      actionReferenceId: created.target_id
    };
  }

  async function confirmCrossDeviceStepUp(input) {
    ensureUuid(input.stepUpSessionId, 'step_up_session_id_invalid');
    ensureText(input.userId, 'user_id_invalid');
    ensureText(input.deviceIdMobile, 'device_id_mobile_invalid');

    const existing = await stepUpRepo.findStepUpSessionById(input.stepUpSessionId);

    if (!existing) {
      throw new StepUpError('step_up_session_not_found', 404, 'step_up_session_not_found');
    }

    if (String(existing.user_id) !== String(input.userId)) {
      throw new StepUpError('step_up_user_mismatch', 403, 'step_up_user_mismatch');
    }

    if (existing.state !== 'pending_verification') {
      throw new StepUpError('step_up_not_pending', 409, 'step_up_not_pending');
    }

    if (!input.biometricVerified) {
      throw new StepUpError('biometric_verification_required', 409, 'biometric_verification_required');
    }

    if (existing.expires_at && new Date(existing.expires_at).getTime() <= Date.now()) {
      await stepUpRepo.expirePendingStepUpSession({
        stepUpSessionId: existing.id,
        eventId: crypto.randomUUID(),
        reason: 'step_up_timeout'
      });

      throw new StepUpError('step_up_expired', 409, 'step_up_expired');
    }

    if (input.decision === 'rejected') {
      const rejected = await stepUpRepo.rejectStepUpSession({
        stepUpSessionId: existing.id,
        userId: input.userId.trim(),
        deviceIdMobile: input.deviceIdMobile.trim(),
        eventId: crypto.randomUUID(),
        reason: 'mobile_rejected'
      });

      if (!rejected) {
        throw new StepUpError('step_up_not_pending', 409, 'step_up_not_pending');
      }

      return {
        stepUpSessionId: rejected.id,
        status: rejected.state,
        confirmedAt: rejected.confirmed_at || null
      };
    }

    const approved = await stepUpRepo.approveStepUpSession({
      stepUpSessionId: existing.id,
      userId: input.userId.trim(),
      deviceIdMobile: input.deviceIdMobile.trim(),
      eventId: crypto.randomUUID()
    });

    if (!approved) {
      throw new StepUpError('step_up_not_pending', 409, 'step_up_not_pending');
    }

    return {
      stepUpSessionId: approved.id,
      status: approved.state,
      confirmedAt: approved.confirmed_at,
      biometricVerified: approved.biometric_verified
    };
  }

  async function getCrossDeviceStepUpStatus(stepUpSessionId) {
    ensureUuid(stepUpSessionId, 'step_up_session_id_invalid');

    let existing = await stepUpRepo.findStepUpSessionById(stepUpSessionId);

    if (!existing) {
      throw new StepUpError('step_up_session_not_found', 404, 'step_up_session_not_found');
    }

    if (
      existing.state === 'pending_verification' &&
      existing.expires_at &&
      new Date(existing.expires_at).getTime() <= Date.now()
    ) {
      await stepUpRepo.expirePendingStepUpSession({
        stepUpSessionId: existing.id,
        eventId: crypto.randomUUID(),
        reason: 'step_up_timeout'
      });

      existing = await stepUpRepo.findStepUpSessionById(stepUpSessionId);
    }

    return {
      stepUpSessionId: existing.id,
      status: existing.state,
      webSessionId: existing.web_session_id || existing.session_id,
      actionType: existing.target_type,
      actionReferenceId: existing.target_id,
      expiresAt: existing.expires_at,
      confirmedAt: existing.confirmed_at || null,
      consumedAt: existing.consumed_at || null,
      invalidatedAt: existing.invalidated_at || null,
      invalidatedReason: existing.invalidated_reason || null
    };
  }

  async function consumeCrossDeviceStepUp(stepUpSessionId) {
    ensureUuid(stepUpSessionId, 'step_up_session_id_invalid');

    const consumed = await stepUpRepo.consumeApprovedStepUpSession({
      stepUpSessionId,
      eventId: crypto.randomUUID()
    });

    if (!consumed) {
      throw new StepUpError('step_up_not_approved', 409, 'step_up_not_approved');
    }

    return {
      stepUpSessionId: consumed.id,
      status: consumed.state,
      consumedAt: consumed.consumed_at
    };
  }

  return {
    requestCrossDeviceStepUp,
    confirmCrossDeviceStepUp,
    getCrossDeviceStepUpStatus,
    consumeCrossDeviceStepUp
  };
}

module.exports = {
  createStepUpService,
  StepUpError
};