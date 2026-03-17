export function buildUsersRepo(db) {
  return {
    async createUser({ email, phone, displayName, status = "active" }) {
      const result = await db.query(
        `
        INSERT INTO users (email, phone, display_name, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, phone, display_name, status, last_login_at, created_at, updated_at
        `,
        [email ?? null, phone ?? null, displayName ?? null, status]
      );

      return result.rows[0];
    },

    async getUserById(userId) {
      const result = await db.query(
        `
        SELECT id, email, phone, display_name, status, last_login_at, created_at, updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [userId]
      );

      return result.rows[0] ?? null;
    },

    async getUserByLogin(login) {
      const result = await db.query(
        `
        SELECT id, email, phone, display_name, status, last_login_at, created_at, updated_at
        FROM users
        WHERE email = $1 OR phone = $1
        LIMIT 1
        `,
        [login]
      );

      return result.rows[0] ?? null;
    },

    async updateLastLogin(userId) {
      const result = await db.query(
        `
        UPDATE users
        SET last_login_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING id, email, phone, display_name, status, last_login_at, created_at, updated_at
        `,
        [userId]
      );

      return result.rows[0] ?? null;
    },
  };
}