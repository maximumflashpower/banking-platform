'use strict';

const express = require('express');
const router = express.Router();

const getWalletBalance = require('../../wallet/usecases/getWalletBalance');

router.get('/wallets/:walletId/balance', async (req, res) => {
  try {
    const { walletId } = req.params;

    const result = await getWalletBalance({ walletId });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(400).json({
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: err.message
    });
  }
});

module.exports = router;