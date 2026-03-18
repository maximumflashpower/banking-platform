'use strict';

const express = require('express');
const { isKycEnabled } = require('../../kyc/kycConfig');
const { completePersonalKycReview } = require('../../kyc/usecases/completePersonalKycReview');

const router = express.Router();

function requireKycEnabled(_req, res, next) {
  if (!isKycEnabled()) {
    return res.status(503).json({
      error: 'kyc_disabled',
      message: 'KYC is currently disabled',
    });
  }

  return next();
}

router.post('/personal/review', requireKycEnabled, async (req, res, next) => {
  try {
    const result = await completePersonalKycReview(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;