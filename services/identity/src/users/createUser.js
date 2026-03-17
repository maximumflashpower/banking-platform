import { hashPassword } from "../auth/passwordHasher.js";
import { buildUsersRepo } from "./usersRepo.js";

export async function createUser({ db, email, phone, displayName, password }) {
  if (!email && !phone) {
    throw new Error("email_or_phone_required");
  }

  const usersRepo = buildUsersRepo(db);
  const passwordHash = hashPassword(password);

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const existingByEmail = email ? await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    ) : { rows: [] };

    if (existingByEmail.rows.length > 0) {
      throw new Error("email_already_exists");
    }

    const existingByPhone = phone ? await client.query(
      `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
      [phone]
    ) : { rows: [] };

    if (existingByPhone.rows.length > 0) {
      throw new Error("phone_already_exists");
    }

    const repo = buildUsersRepo(client);

    const user = await repo.createUser({
      email,
      phone,
      displayName,
      status: "active",
    });

    await client.query(
      `
      INSERT INTO user_credentials (
        user_id,
        credential_type,
        password_hash
      )
      VALUES ($1, 'password', $2)
      `,
      [user.id, passwordHash]
    );

    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}