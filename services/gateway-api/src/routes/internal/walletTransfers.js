'use strict';

const express = require('express');
const router = express.Router();

const transferBetweenWallets = require('../../wallet/usecases/transferBetweenWallets');

router.post('/wallet/transfers', async (req, res) => {
  try {
    const {
      from_wallet_id,
      to_wallet_id,
      amount,
      currency,
      reference_type,
      reference_id
    } = req.body || {};

    const result = await transferBetweenWallets({
      fromWalletId: from_wallet_id,
      toWalletId: to_wallet_id,
      amount,
      currency,
      referenceType: reference_type,
      referenceId: reference_id
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

module.exports = router;