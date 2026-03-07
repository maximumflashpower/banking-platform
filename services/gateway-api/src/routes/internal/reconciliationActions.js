'use strict';

const express = require('express');
const router = express.Router();

const financialDb = require('../../infrastructure/financialDb');
const reconciliationQueryRepo = require('../../repos/reconciliationQueryRepo');

router.get('/reconciliation/actions', async (req, res) => {
  try {
    const limit = req.query.limit;
    const actions = await reconciliationQueryRepo.listActions(financialDb, { limit });

    return res.json({
      ok: true,
      actions
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: 'reconciliation_actions_list_failed'
    });
  }
});

module.exports = router;