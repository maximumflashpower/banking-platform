const express = require('express');
const router = express.Router();

const { runDailyReconciliation } = require('../../../../ledger/src/reconciliation/runDailyReconciliation');

router.post('/reconciliation/run/daily', async (req, res) => {

    try {

        const { run_date, statement } = req.body;

        if (!run_date || !statement) {
            return res.status(400).json({
                error: 'run_date and statement required'
            });
        }

        const result = await runDailyReconciliation(run_date, statement);

        res.json({
            status: 'completed',
            ...result
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: 'reconciliation_failed'
        });

    }

});

module.exports = router;