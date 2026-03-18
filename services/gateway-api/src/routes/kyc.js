'use strict';

const express = require('express');
const { isKycEnabled } = require('../kyc/kycConfig');
const { startPersonalKyc } = require('../kyc/usecases/startPersonalKyc');
const { submitPersonalKycDocuments } = require('../kyc/usecases/submitPersonalKycDocuments');
const { getPersonalKycStatus } = require('../kyc/usecases/getPersonalKycStatus');

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

router.post('/personal/start', requireKycEnabled, async (req, res, next) => {
  try {
    const result = await startPersonalKyc(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

router.post('/personal/documents', requireKycEnabled, async (req, res, next) => {
  try {
    const result = await submitPersonalKycDocuments(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/personal/status', requireKycEnabled, async (req, res, next) => {
  try {
    const result = await getPersonalKycStatus(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;