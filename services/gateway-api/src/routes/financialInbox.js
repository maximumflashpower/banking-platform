const express = require("express");
const financialDb = require("../infrastructure/financialDb");

const router = express.Router();

router.get("/", async (req, res) => {
  const spaceId = req.header("X-Space-Id");
  if (!spaceId) return res.status(400).json({ error: "missing_space_id" });

  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);

  let cursorCreatedAt = null;
  let cursorId = null;

  if (req.query.cursor) {
    try {
      const raw = Buffer.from(String(req.query.cursor), "base64").toString("utf8");
      const [ts, id] = raw.split("|");
      cursorCreatedAt = ts;
      cursorId = id;
    } catch {
      return res.status(400).json({ error: "invalid_cursor" });
    }
  }

  try {
    const params = [spaceId, limit];
    let where = `m.space_uuid = $1`;
    if (cursorCreatedAt && cursorId) {
      params.push(cursorCreatedAt, cursorId);
      where += ` AND (m.created_at, m.id) < ($3::timestamptz, $4::uuid)`;
    }

    const { rows } = await financialDb.query(
      `
      SELECT
        m.id,
        m.type,
        m.payload,
        m.correlation_id,
        m.created_at,
        (a.message_id IS NOT NULL) AS acked,
        a.acked_at
      FROM ops.financial_inbox_messages m
      LEFT JOIN ops.financial_inbox_ack a
        ON a.space_uuid = m.space_uuid AND a.message_id = m.id
      WHERE ${where}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2
      `,
      params
    );

    const nextCursor =
      rows.length === limit
        ? Buffer.from(`${rows[rows.length - 1].created_at.toISOString()}|${rows[rows.length - 1].id}`).toString("base64")
        : null;

    return res.json({ items: rows, next_cursor: nextCursor });
  } catch (err) {
    console.error("GET /financial-inbox error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:message_id/ack", express.json(), async (req, res) => {
  const spaceId = req.header("X-Space-Id");
  if (!spaceId) return res.status(400).json({ error: "missing_space_id" });

  const messageId = req.params.message_id;
  const note = req.body?.note || null;
  const actorId = req.header("X-Actor-Id") || null;

  try {
    const msg = await financialDb.query(
      `SELECT id FROM ops.financial_inbox_messages WHERE id=$1 AND space_uuid=$2`,
      [messageId, spaceId]
    );
    if (msg.rows.length === 0) return res.status(404).json({ error: "message_not_found" });

    const { rows } = await financialDb.query(
      `
      INSERT INTO ops.financial_inbox_ack(space_uuid, message_id, actor_id, note)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (space_uuid, message_id) DO UPDATE
        SET note = COALESCE(EXCLUDED.note, ops.financial_inbox_ack.note)
      RETURNING id, space_uuid, message_id, acked_at
      `,
      [spaceId, messageId, actorId, note]
    );

    return res.json({ ok: true, ack: rows[0] });
  } catch (err) {
    console.error("POST /financial-inbox/:id/ack error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
