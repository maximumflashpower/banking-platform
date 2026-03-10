'use strict';

const express = require('express');
const { getBalances } = require('../../../../ledger/src/accounts/core/balances');

const router = express.Router();

router.get('/accounts/:id/balance', async (req, res) => {
  try {
    const accountId = String(req.params.id || '').trim();
    const currency = String(req.query.currency || 'USD').trim().toUpperCase();

    if (!accountId) {
      return res.status(400).json({ error: 'missing_account_id' });
    }

    const result = await getBalances({ accountId, currency });

    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'failed_to_get_balance',
      message: error.message,
    });
  }
});

module.exports = router;