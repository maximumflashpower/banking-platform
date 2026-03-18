const express = require('express');
const createLedgerEntry = require('../../ledgerDomain/usecases/createLedgerEntry');

const router = express.Router();

router.post('/internal/v1/ledger/entries', async (req, res) => {
  try {
    const result = await createLedgerEntry(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'unexpected error'
      }
    });
  }
});

module.exports = router;