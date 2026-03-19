'use strict';

const express = require('express');
const executePaymentIntent = require('../../payments/usecases/executePaymentIntent');

const router = express.Router();

function sendError(res, error) {
  const status = error.status || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'internal error';

  return res.status(status).json({
    ok: false,
    code,
    message,
  });
}

router.post('/payment-intents/:id/execute', async (req, res) => {
  try {
    const result = await executePaymentIntent(req.params.id);

    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;