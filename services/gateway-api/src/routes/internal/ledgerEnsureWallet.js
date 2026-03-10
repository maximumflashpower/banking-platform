'use strict';

const express = require('express');
const { ensurePersonalWallet } = require('../../../../ledger/src/accounts/core/ensureWallet');

const router = express.Router();

router.post('/accounts/ensure-wallet', async (req, res) => {
  try {
    const spaceId = req.body?.spaceId || req.query?.spaceId || null;
    const currency = String(req.body?.currency || req.query?.currency || 'USD').trim().toUpperCase();

    if (!spaceId) {
      return res.status(400).json({ error: 'missing_space_id' });
    }

    const accounts = await ensurePersonalWallet({
      spaceId: String(spaceId),
      currency,
    });

    return res.status(200).json({
      ok: true,
      spaceId: String(spaceId),
      currency,
      wallet: { accounts },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'failed_to_ensure_wallet',
      message: error.message,
    });
  }
});

module.exports = router;