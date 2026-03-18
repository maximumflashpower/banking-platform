'use strict';

const express = require('express');
const { createLedgerAccountForWallet } = require('../../ledgerDomain/usecases/createLedgerAccountForWallet');

const router = express.Router();

router.post('/wallet-accounts', async (req, res, next) => {
  try {
    const result = await createLedgerAccountForWallet(req);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;