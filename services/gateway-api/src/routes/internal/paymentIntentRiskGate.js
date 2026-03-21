'use strict';

const express = require('express');
const {
  createPaymentIntentRiskPassiveService
} = require('../../services/payments/paymentIntentRiskPassiveService');

const router = express.Router();
const riskPassiveService = createPaymentIntentRiskPassiveService({});

router.post('/intents/:id/risk-gate/re-evaluate', async (req, res, next) => {
  try {
    const riskAssessment = await riskPassiveService.evaluatePassiveRisk({
      paymentIntent: {
        id: req.params.id,
        amount_cents: Number(req.body?.amount_cents || 0),
        payer_user_id: req.body?.payer_user_id || null,
        payee_user_id: req.body?.payee_user_id || null,
        space_id: req.body?.space_id || null,
        currency: req.body?.currency || 'USD'
      },
      requestContext: {}
    });

    return res.status(200).json({
      payment_intent_id: req.params.id,
      ...(riskAssessment ? { risk_assessment: riskAssessment } : {})
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;