'use strict';

const express = require('express');
const identityDb = require('../infrastructure/identityDb');
const { createStepUpRepo } = require('../repos/identity/stepUpRepo');
const { createStepUpService, StepUpError } = require('../repos/identity/stepUpService');
const { writeAuditEvent } = require('../services/audit/auditService');

const router = express.Router();

const repo = createStepUpRepo({ identityDb });
const service = createStepUpService({ stepUpRepo: repo });

router.post('/request', async (req, res) => {
  try {
    const result = await service.requestCrossDeviceStepUp({
      webSessionId: req.body.webSessionId,
      spaceId: req.body.spaceId,
      actionType: req.body.actionType,
      actionReferenceId: req.body.actionReferenceId,
      deviceIdWeb: req.body.deviceIdWeb,
      reason: req.body.reason,
      ttlSeconds: req.body.ttlSeconds
    });
    await writeAuditEvent(req, {
      event_category: 'step_up',
      event_type: 'step_up.requested',
      action: 'request',
      result: 'success',
      target_type: req.body.actionType || null,
      target_id: req.body.actionReferenceId || null,
      actor_space_id: req.body.spaceId || null,
      metadata: {
        step_up_session_id: result.stepUpSessionId,
        web_session_id: result.webSessionId || req.body.webSessionId || null,
        action_type: req.body.actionType || null,
        action_reference_id: req.body.actionReferenceId || null
      }
    });
    return res.status(202).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const result = await service.confirmCrossDeviceStepUp({
      stepUpSessionId: req.body.stepUpSessionId,
      userId: req.body.userId,
      deviceIdMobile: req.body.deviceIdMobile,
      decision: req.body.decision || 'approved',
      biometricVerified: req.body.biometricVerified === true
    });
    await writeAuditEvent(req, {
      event_category: 'step_up',
      event_type: result.status === 'verified' ? 'step_up.verified' : 'step_up.confirmed',
      action: 'confirm',
      result: result.status === 'verified' ? 'success' : (result.status || 'accepted'),
      actor_user_id: req.body.userId || null,
      target_type: 'step_up_session',
      target_id: result.stepUpSessionId || req.body.stepUpSessionId || null,
      metadata: {
        step_up_session_id: result.stepUpSessionId || req.body.stepUpSessionId || null,
        decision: req.body.decision || 'approved',
        biometric_verified: req.body.biometricVerified === true,
        device_id_mobile: req.body.deviceIdMobile || null
      }
    });
    return res.status(202).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/status', async (req, res) => {
  try {
    const result = await service.getCrossDeviceStepUpStatus(req.query.stepUpSessionId);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

function sendError(res, error) {
  if (error instanceof StepUpError) {
    return res.status(error.status).json({
      error: error.code,
      message: error.message
    });
  }

  console.error('[step-up] unhandled error', error);

  return res.status(500).json({
    error: 'internal_error',
    message: 'internal_error'
  });
}

module.exports = router;