export function buildSessionsRepo(db) {
  return {
    async createSession({
      userId,
      sessionType,
      spaceId = null,
      deviceId = null,
      expiresAt,
    }) {
      const result = await db.query(
        `
        INSERT INTO sessions (
          user_id,
          session_type,
          space_id,
          device_id,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [userId, sessionType, spaceId, deviceId, expiresAt]
      );

      return result.rows[0];
    },

    async getSessionById(sessionId) {
      const result = await db.query(
        `
        SELECT *
        FROM sessions
        WHERE id = $1
        LIMIT 1
        `,
        [sessionId]
      );

      return result.rows[0] ?? null;
    },

    async invalidateSession(sessionId, reason = "logout") {
      const result = await db.query(
        `
        UPDATE sessions
        SET status = 'invalidated',
            invalidated_at = now(),
            invalidated_reason = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [sessionId, reason]
      );

      return result.rows[0] ?? null;
    },

    async markExpiredSessions() {
      const result = await db.query(
        `
        UPDATE sessions
        SET status = 'expired',
            updated_at = now()
        WHERE status = 'active'
          AND expires_at <= now()
        RETURNING id
        `
      );

      return result.rowCount;
    },
  };
}