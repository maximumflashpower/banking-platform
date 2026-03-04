async function checkIdempotency(client, key) {
  const result = await client.query(
    "SELECT response FROM idempotency_keys WHERE idempotency_key = $1",
    [key]
  );

  if (result.rows.length > 0) {
    return result.rows[0].response;
  }

  return null;
}

async function storeIdempotency(client, key, response) {
  await client.query(
    "INSERT INTO idempotency_keys (idempotency_key, response) VALUES ($1, $2)",
    [key, JSON.stringify(response)]
  );
}

module.exports = {
  checkIdempotency,
  storeIdempotency
};