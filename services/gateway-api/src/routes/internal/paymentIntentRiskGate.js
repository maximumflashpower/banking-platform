'use strict';

const express = require('express');
const paymentIntentRiskGateService = require('../../services/payments/paymentIntentRiskGateService');

const router = express.Router();

router.post('/intents/:id/risk-gate/re-evaluate', async (req, res, next) => {
  try {
    const result = await paymentIntentRiskGateService.reEvaluate({
      paymentIntentId: req.params.id,
      patch: req.body?.patch || {},
      actor: req.body?.actor || { type: 'system', id: 'internal-api' }
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;