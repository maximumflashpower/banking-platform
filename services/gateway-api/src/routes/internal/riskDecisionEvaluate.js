'use strict';

const express = require('express');

const router = express.Router();

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

router.post('/decision/evaluate', async (req, res) => {
  const body = req.body || {};

  const cardId = body.card_id || body.cardId || null;
  const spaceId = body.space_id || body.spaceId || null;
  const amount = toNumber(body.amount);
  const currency = String(body.currency || 'USD').trim().toUpperCase();
  const merchantMcc = body.merchant_mcc || body.merchantMcc || null;

  if (!cardId) {
    return res.status(400).json({
      ok: false,
      error: 'card_id is required',
    });
  }

  // Stage 6E minimal:
  // mantener wiring listo pero devolver allow por defecto.
  // Se deja un ejemplo opcional de bloqueo simple por MCC para pruebas controladas.
  if (merchantMcc === '9999') {
    return res.status(200).json({
      ok: true,
      data: {
        decision: 'block_tx',
        score: 95,
        reason: 'stage6e_test_block_mcc',
      },
    });
  }

  if (amount >= 1000000 && spaceId) {
    return res.status(200).json({
      ok: true,
      data: {
        decision: 'allow_with_monitoring',
        score: 60,
        reason: 'stage6e_high_amount_monitoring',
      },
    });
  }

  return res.status(200).json({
    ok: true,
    data: {
      decision: 'allow',
      score: 0,
      reason: 'stage6e_default_allow',
      currency,
    },
  });
});

module.exports = router;