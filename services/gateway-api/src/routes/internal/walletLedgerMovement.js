const express = require('express');
const postWalletLedgerMovement = require('../../wallet/usecases/postWalletLedgerMovement');

const router = express.Router();

router.post('/internal/v1/wallet/movements', async (req, res) => {
  try {
    const result = await postWalletLedgerMovement(req.body || {});
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
