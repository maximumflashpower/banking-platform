'use strict';

const express = require('express');
const { commitPostings } = require('../../../../ledger/src/postings/core/commit');

const router = express.Router();

router.post('/postings/commit', async (req, res, next) => {
  try {
    const idemKey =
      req.body.idemKey ||
      req.body.idempotencyKey ||
      req.header('Idempotency-Key') ||
      null;

    const result = await commitPostings({
      spaceId: req.body.spaceId || req.body.space_id,
      idemKey,
      memo: req.body.memo || null,
      effectiveAt: req.body.effectiveAt || req.body.effective_at || null,
      postings: req.body.postings || [],
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;