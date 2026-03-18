'use strict';

const express = require('express');
const router = express.Router();

const { getWalletBalance } = require('../../wallet/usecases/getWalletBalance');

router.get('/wallets/:wallet_id/balance', async (req, res) => {
  try {
    const { wallet_id } = req.params;

    const result = await getWalletBalance({ wallet_id });

    return res.status(200).json({
      ok: true,
      wallet_id: result.wallet_id,
      account_code: result.account_code,
      currency: result.currency,
      balance: result.balance
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      code: err.code || 'UNKNOWN_ERROR',
      message: err.message
    });
  }
});

module.exports = router;