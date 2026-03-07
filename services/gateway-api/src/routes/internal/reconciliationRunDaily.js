'use strict';

const express = require('express');
const router = express.Router();

const { runDailyReconciliation } = require('../../../../ledger/src/reconciliation/runDailyReconciliation');
const financialDb = require('../../infrastructure/financialDb');
const caseDb = require('../../infrastructure/caseDb');
const { processReconciliationRun } = require('../../services/reconciliation/processReconciliationRun');

router.post('/reconciliation/run/daily', async (req, res) => {
  try {
    const { run_date, statement } = req.body;

    if (!run_date || !statement) {
      return res.status(400).json({
        error: 'run_date and statement required'
      });
    }

    const result = await runDailyReconciliation(run_date, statement);

    if (result && result.run_id) {
      try {
        await processReconciliationRun({
          financialDb,
          caseDb,
          runId: result.run_id,
          summary: result.summary || {}
        });
      } catch (postProcessErr) {
        console.error('[reconciliation 4d] post-process failed', postProcessErr);
      }
    }

    return res.json({
      status: 'completed',
      ...result
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'reconciliation_failed'
    });
  }
});

module.exports = router;
