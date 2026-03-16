import { verifyPassword } from "./passwordHasher.js";

export async function loginWithPassword({ db, login, password }) {

  const result = await db.query(
    `
    SELECT
        u.id,
        u.email,
        u.phone,
        u.display_name,
        u.status,
        u.last_login_at,
        c.password_hash,
        c.failed_attempts,
        c.locked_until
    FROM users u
    JOIN user_credentials c
    ON c.user_id = u.id
    WHERE u.email = $1 OR u.phone = $1
    LIMIT 1
    `,
    [login]
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error("invalid_credentials");
  }

  if (user.status === "disabled" || user.status === "locked") {
    throw new Error("user_not_active");
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new Error("user_temporarily_locked");
  }

  const valid = verifyPassword(password, user.password_hash);

  if (!valid) {

    await db.query(
      `
      UPDATE user_credentials
      SET failed_attempts = failed_attempts + 1,
          updated_at = now()
      WHERE user_id = $1
      `,
      [user.id]
    );

    throw new Error("invalid_credentials");
  }

  await db.query(
    `
    UPDATE users
    SET last_login_at = now(),
        updated_at = now()
    WHERE id = $1
    `,
    [user.id]
  );

  await db.query(
    `
    UPDATE user_credentials
    SET failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE user_id = $1
    `,
    [user.id]
  );

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.display_name,
    status: user.status
  };
}