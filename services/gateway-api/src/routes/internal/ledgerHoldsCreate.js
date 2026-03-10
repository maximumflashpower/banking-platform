'use strict';

const express = require('express');
const { createHold } = require('../../../../ledger/src/holds/createHold');

const router = express.Router();

router.post('/holds/create', async (req, res) => {
  try {
    const {
      accountId,
      spaceId,
      holdRef,
      externalRef,
      amount,
      currency,
      reason,
      metadata,
    } = req.body || {};

    if (!accountId || !spaceId || !holdRef || !amount || !currency || !reason) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const result = await createHold({
      accountId,
      spaceId,
      holdRef,
      externalRef: externalRef || null,
      amount: Number(amount),
      currency: String(currency).toUpperCase(),
      reason,
      metadata: metadata || {},
    });

    return res.status(200).json({
      holdId: result.hold.id,
      holdRef: result.hold.hold_ref,
      status: result.hold.status,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'failed_to_create_hold',
      message: error.message,
    });
  }
});

module.exports = router;