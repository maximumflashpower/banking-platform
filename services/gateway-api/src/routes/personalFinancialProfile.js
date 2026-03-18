'use strict';

const express = require('express');
const { upsertPersonalFinancialProfile } = require('../financialProfile/usecases/upsertPersonalFinancialProfile');
const { getPersonalFinancialProfile } = require('../financialProfile/usecases/getPersonalFinancialProfile');
const { evaluatePersonalFinancialEligibility } = require('../financialProfile/usecases/evaluatePersonalFinancialEligibility');

const router = express.Router();

router.post('/personal-financial-profile', async (req, res, next) => {
  try {
    const result = await upsertPersonalFinancialProfile(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/personal-financial-profile', async (req, res, next) => {
  try {
    const result = await getPersonalFinancialProfile(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

router.post('/personal-financial-profile/evaluate', async (req, res, next) => {
  try {
    const result = await evaluatePersonalFinancialEligibility(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;