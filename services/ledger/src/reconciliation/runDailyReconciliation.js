const { financialDb } = require('../infrastructure/financialDb');

async function runDailyReconciliation(runDate, statementRows) {

    const run = await financialDb.one(`
        INSERT INTO reconciliation_runs (run_date)
        VALUES ($1)
        RETURNING *
    `, [runDate]);

    const runId = run.id;

    let matched = 0;
    let missingLedger = 0;
    let missingBank = 0;
    let mismatch = 0;

    for (const row of statementRows) {

        const ledgerTx = await financialDb.oneOrNone(`
            SELECT *
            FROM ledger_journal_entries
            WHERE external_reference = $1
        `, [row.reference]);

        let state;

        if (!ledgerTx) {
            state = 'missing_in_ledger';
            missingLedger++;
        } else if (Number(ledgerTx.amount) !== Number(row.amount)) {
            state = 'amount_mismatch';
            mismatch++;
        } else {
            state = 'matched';
            matched++;
        }

        await financialDb.none(`
            INSERT INTO reconciliation_items (
                reconciliation_run_id,
                external_reference,
                ledger_reference,
                bank_amount,
                ledger_amount,
                discrepancy_state
            )
            VALUES ($1,$2,$3,$4,$5,$6)
        `, [
            runId,
            row.reference,
            ledgerTx?.id,
            row.amount,
            ledgerTx?.amount,
            state
        ]);
    }

    const summary = {
        total_items: statementRows.length,
        matched,
        missing_in_ledger: missingLedger,
        missing_in_bank: missingBank,
        amount_mismatch: mismatch
    };

    await financialDb.none(`
        UPDATE reconciliation_runs
        SET
            status='completed',
            completed_at=now(),
            summary_json=$2
        WHERE id=$1
    `, [runId, summary]);

    return {
        run_id: runId,
        summary
    };
}

module.exports = { runDailyReconciliation };