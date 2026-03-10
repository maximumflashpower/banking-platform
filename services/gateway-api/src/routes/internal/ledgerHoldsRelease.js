'use strict';

const express = require('express');
const { releaseHold } = require('../../../../ledger/src/holds/releaseHold');

const router = express.Router();

router.post('/holds/release', async (req, res) => {
  try {
    const { holdRef, reason } = req.body || {};

    if (!holdRef) {
      return res.status(400).json({ error: 'missing_hold_ref' });
    }

    const result = await releaseHold({
      holdRef,
      reason: reason || 'manual_release',
    });

    return res.status(200).json({
      holdId: result.hold.id,
      holdRef: result.hold.hold_ref,
      status: result.hold.status,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (error) {
    if (String(error.message || '').startsWith('hold_not_found:')) {
      return res.status(404).json({ error: 'hold_not_found' });
    }

    return res.status(500).json({
      error: 'failed_to_release_hold',
      message: error.message,
    });
  }
});

module.exports = router;