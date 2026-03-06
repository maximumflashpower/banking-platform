const { runDailyReconciliation } = require('../../services/ledger/src/reconciliation/runDailyReconciliation');

test('daily reconciliation summary', async () => {

    const result = await runDailyReconciliation('2026-03-06', [
        { reference: 'TEST1', amount: 10 }
    ]);

    expect(result.summary.total_items).toBe(1);

});