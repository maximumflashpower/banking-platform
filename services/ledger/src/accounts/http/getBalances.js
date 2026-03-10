'use strict';

const express = require('express');
const { getBalances } = require('../core/balances');

const router = express.Router();

router.get('/accounts/:id/balance', async (req, res) => {
  try {
    const accountId = String(req.params.id || '').trim();
    const currency = String(req.query.currency || 'USD').trim().toUpperCase();

    if (!accountId) {
      return res.status(400).json({
        error: 'missing_account_id',
      });
    }

    const balances = await getBalances({
      accountId,
      currency,
    });

    return res.status(200).json({
      ok: true,
      accountId,
      currency,
      asOf: new Date().toISOString(),
      ...balances,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'failed_to_get_balance',
      message: error?.message || 'unknown',
    });
  }
});

router.get('/spaces/:spaceId/balances', async (req, res) => {
  try {
    const spaceId = String(req.params.spaceId || '').trim();
    const currency = String(req.query.currency || 'USD').trim().toUpperCase();

    if (!spaceId) {
      return res.status(400).json({
        error: 'missing_space_id',
      });
    }

    const balances = await getBalances({
      spaceId,
      currency,
    });

    return res.status(200).json({
      ok: true,
      spaceId,
      currency,
      asOf: new Date().toISOString(),
      balances,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'failed_to_get_balances',
      message: error?.message || 'unknown',
    });
  }
});

module.exports = router;