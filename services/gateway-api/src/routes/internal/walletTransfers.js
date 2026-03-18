const express = require('express');
const transferBetweenWallets = require('../../wallet/usecases/transferBetweenWallets');

const router = express.Router();

router.post('/internal/v1/wallet/transfers', async (req, res) => {
  try {
    const result = await transferBetweenWallets(req.body || {});
    return res.status(200).json({
      ok: true,
      entry: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

module.exports = router;
