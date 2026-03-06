'use strict';

const express = require('express');
const { processAchWebhook } = require('../../services/payments/rails/webhookProcessor');

const router = express.Router();

router.post('/webhooks/ach/ingest', async (req, res, next) => {
  try {
    const result = await processAchWebhook({
      payload: req.body || {},
      rawBody: req.rawBody || JSON.stringify(req.body || {}),
    });

    const statusCode = result.ok ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;