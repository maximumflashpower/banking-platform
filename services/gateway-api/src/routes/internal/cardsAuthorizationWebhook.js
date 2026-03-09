const express = require('express');
const cardsDb = require('../../infrastructure/cardsDb');
const financialDb = require('../../infrastructure/financialDb');
const {
  decideAuthorization
} = require('../../services/cards/authorizations/authorizationDecisionService');

const router = express.Router();

router.post('/webhooks/authorization', async (req, res, next) => {
  try {
    const payload = {
      provider: req.body.provider || 'processor',
      providerEventId: req.body.provider_event_id || null,
      providerAuthId: req.body.provider_auth_id || null,
      idempotencyKey: req.body.idempotency_key || req.header('Idempotency-Key') || null,
      cardId: req.body.card_id,
      spaceId: req.body.space_id || null,
      amount: Number(req.body.amount),
      currency: req.body.currency,
      merchantName: req.body.merchant_name || null,
      merchantMcc: req.body.merchant_mcc || null,
      rawPayload: req.body
    };

    const result = await decideAuthorization({
      cardsDb,
      financialDb,
      payload
    });

    return res.status(200).json({
      ok: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;