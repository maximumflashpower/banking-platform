'use strict';

const express = require('express');
const { ensurePersonalWallet } = require('../core/ensureWallet');

const router = express.Router();

router.post('/accounts/ensure-wallet', async (req, res) => {
  try {
    const spaceId =
      req.body?.spaceId ||
      req.query?.spaceId ||
      null;

    if (!spaceId) {
      return res.status(400).json({
        error: 'missing_space_id',
      });
    }

    const currency = String(req.body?.currency || req.query?.currency || 'USD')
      .trim()
      .toUpperCase();

    const accounts = await ensurePersonalWallet({
      spaceId: String(spaceId),
      currency,
    });

    return res.status(200).json({
      ok: true,
      spaceId: String(spaceId),
      currency,
      wallet: {
        accounts,
      },
    });
  } catch (error) {
    const msg = String(error?.message || error);

    if (msg === 'currency_required') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'currency required',
      });
    }

    return res.status(500).json({
      error: 'internal_error',
      message: msg,
    });
  }
});

module.exports = router;