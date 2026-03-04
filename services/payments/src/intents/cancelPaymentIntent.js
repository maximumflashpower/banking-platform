const { assertTransition } = require("./stateMachine");
const financialDb = require("../infrastructure/financialDb");

async function cancelPaymentIntent(req, res) {
  const { id } = req.params;

  const client = await financialDb.getClient();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT status FROM payment_intents WHERE id=$1",
      [id]
    );

    const current = result.rows[0].status;

    assertTransition(current, "canceled");

    await client.query(
      "UPDATE payment_intents SET status='canceled' WHERE id=$1",
      [id]
    );

    await client.query(
      `INSERT INTO payment_intent_states (intent_id,state)
       VALUES ($1,'canceled')`,
      [id]
    );

    await client.query("COMMIT");
    res.json({ success: true });

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = cancelPaymentIntent;