'use strict';

const express = require('express');
const { requireKycVerified } = require('../middleware/requireKycVerified');

const router = express.Router();

router.get('/probe', requireKycVerified, async (req, res) => {
  return res.status(200).json({
    ok: true,
    stage: 'stage3a2',
    action: 'kyc_protected_probe',
    message: 'KYC verified access granted',
    kyc: req.kyc,
  });
});

module.exports = router;