const { pool } = require('../infrastructure/financialDb');

async function runDailyReconciliation(runDate, statementRows) {

    const client = await pool.connect();

    try {

        await client.query('BEGIN');

        const runResult = await client.query(
            `
            INSERT INTO reconciliation_runs (run_date)
            VALUES ($1)
            RETURNING id
            `,
            [runDate]
        );

        const runId = runResult.rows[0].id;

        let matched = 0;
        let missingLedger = 0;
        let missingBank = 0;
        let mismatch = 0;

        for (const row of statementRows) {

            const ledgerResult = await client.query(
                `
                SELECT id
                FROM ledger_journal_entries
                WHERE id::text = $1
                `,
                [row.reference]
            );

            const ledgerTx = ledgerResult.rows[0];

            let state;

            if (!ledgerTx) {
                state = 'missing_in_ledger';
                missingLedger++;
            } else {
                state = 'matched';
                matched++;
            }

            await client.query(
                `
                INSERT INTO reconciliation_items (
                    reconciliation_run_id,
                    external_reference,
                    ledger_reference,
                    bank_amount,
                    ledger_amount,
                    discrepancy_state
                )
                VALUES ($1,$2,$3,$4,$5,$6)
                `,
                [
                    runId,
                    row.reference,
                    ledgerTx ? ledgerTx.id : null,
                    row.amount,
                    null,
                    state
                ]
            );
        }

        const summary = {
            total_items: statementRows.length,
            matched,
            missing_in_ledger: missingLedger,
            missing_in_bank: missingBank,
            amount_mismatch: mismatch
        };

        await client.query(
            `
            UPDATE reconciliation_runs
            SET
                status='completed',
                completed_at=now(),
                summary_json=$2
            WHERE id=$1
            `,
            [runId, summary]
        );

        await client.query('COMMIT');

        return {
            run_id: runId,
            summary
        };

    } catch (err) {

        await client.query('ROLLBACK');
        throw err;

    } finally {

        client.release();

    }
}

module.exports = { runDailyReconciliation };