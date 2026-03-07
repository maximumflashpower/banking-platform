'use strict';

const express = require('express');
const router = express.Router();

const financialDb = require('../../infrastructure/financialDb');
const reconciliationQueryRepo = require('../../repos/reconciliationQueryRepo');

router.get('/reconciliation/runs', async (req, res) => {
  try {
    const limit = req.query.limit;
    const runs = await reconciliationQueryRepo.listRuns(financialDb, { limit });

    return res.json({
      ok: true,
      runs
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: 'reconciliation_runs_list_failed'
    });
  }
});

router.get('/reconciliation/runs/:id', async (req, res) => {
  try {
    const runId = req.params.id;

    const run = await reconciliationQueryRepo.findRunById(financialDb, runId);
    if (!run) {
      return res.status(404).json({
        ok: false,
        error: 'reconciliation_run_not_found'
      });
    }

    const items = await reconciliationQueryRepo.listItemsByRunId(financialDb, runId);
    const action = await reconciliationQueryRepo.findActionByRunId(financialDb, runId);

    return res.json({
      ok: true,
      run,
      items,
      action
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: 'reconciliation_run_detail_failed'
    });
  }
});

module.exports = router;