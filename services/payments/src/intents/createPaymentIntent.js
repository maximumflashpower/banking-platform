const { assertTransition } = require("./stateMachine");
const { checkIdempotency, storeIdempotency } = require("../infrastructure/idempotencyService");
const { publishEvent } = require("../infrastructure/financialOutbox");
const financialDb = require("../infrastructure/financialDb");

async function createPaymentIntent(req, res) {
  const { space_id, amount, currency, target_space_id } = req.body;
  const idempotency_key = req.headers["idempotency-key"];
  const correlation_id = req.headers["correlation-id"];

  if (!idempotency_key) throw new Error("idempotency_key required");
  if (!correlation_id) throw new Error("correlation_id required");

  const client = await financialDb.getClient();

  try {
    await client.query("BEGIN");

    const existing = await checkIdempotency(client, idempotency_key);
    if (existing) {
      await client.query("ROLLBACK");
      return res.json(existing);
    }

    const intentResult = await client.query(
      `INSERT INTO payment_intents
       (space_id, target_space_id, amount, currency, status, correlation_id)
       VALUES ($1,$2,$3,$4,'created',$5)
       RETURNING *`,
      [space_id, target_space_id, amount, currency, correlation_id]
    );

    const intent = intentResult.rows[0];

    await client.query(
      `INSERT INTO payment_intent_states (intent_id, state)
       VALUES ($1,'created')`,
      [intent.id]
    );

    assertTransition("created", "validated");

    await client.query(
      `UPDATE payment_intents SET status='validated' WHERE id=$1`,
      [intent.id]
    );

    await client.query(
      `INSERT INTO payment_intent_states (intent_id, state)
       VALUES ($1,'validated')`,
      [intent.id]
    );

    assertTransition("validated", "queued");

    await client.query(
      `UPDATE payment_intents SET status='queued' WHERE id=$1`,
      [intent.id]
    );

    await client.query(
      `INSERT INTO payment_intent_states (intent_id, state)
       VALUES ($1,'queued')`,
      [intent.id]
    );

    // Doble partida ledger
    await client.query(
      `SELECT commit_p2p($1,$2,$3,$4)`,
      [space_id, target_space_id, amount, currency]
    );

    assertTransition("queued", "settled");

    await client.query(
      `UPDATE payment_intents SET status='settled' WHERE id=$1`,
      [intent.id]
    );

    await client.query(
      `INSERT INTO payment_intent_states (intent_id, state)
       VALUES ($1,'settled')`,
      [intent.id]
    );

    await publishEvent(client, "fin.payment.settled.v1", {
      intent_id: intent.id,
      correlation_id
    });

    await storeIdempotency(client, idempotency_key, intent);

    await client.query("COMMIT");

    res.json(intent);

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = createPaymentIntent;