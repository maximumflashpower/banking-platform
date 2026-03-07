'use strict';

async function createDefaultControls(client, cardId) {
  const inserted = await client.query(
    `
      INSERT INTO card_controls_limits (card_id)
      VALUES ($1)
      ON CONFLICT (card_id) DO NOTHING
      RETURNING *
    `,
    [cardId]
  );

  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await client.query(
    `
      SELECT *
      FROM card_controls_limits
      WHERE card_id = $1
      LIMIT 1
    `,
    [cardId]
  );

  return existing.rows[0] || null;
}

async function getByCardId(dbOrClient, cardId) {
  const result = await dbOrClient.query(
    `
      SELECT *
      FROM card_controls_limits
      WHERE card_id = $1
      LIMIT 1
    `,
    [cardId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createDefaultControls,
  getByCardId,
};