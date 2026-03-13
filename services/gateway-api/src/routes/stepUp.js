'use strict';

const express = require('express');
const identityDb = require('../infrastructure/identityDb');
const { createStepUpRepo } = require('../repos/identity/stepUpRepo');
const { createStepUpService, StepUpError } = require('../repos/identity/stepUpService');

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