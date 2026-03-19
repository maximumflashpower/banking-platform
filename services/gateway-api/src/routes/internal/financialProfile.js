'use strict';

const express = require('express');
const router = express.Router();

router.post('/financial-profile', async (req, res) => {
  try {
    const { user_id, income } = req.body || {};

    if (!user_id) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_REQUEST',
        message: 'user_id is required'
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        user_id,
        income: income ?? null,
        eligibility_status: 'eligible'
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR'
    });
  }
});

router.get('/financial-profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    return res.status(200).json({
      ok: true,
      data: {
        user_id: userId,
        eligibility_status: 'eligible'
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;