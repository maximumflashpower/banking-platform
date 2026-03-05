const identityDb = require("../../infrastructure/identityDb");

async function addOwner({ business_id, user_id, owner_type, actor_user_id }) {
  // Not exposed as endpoint in 3A list, but kept for completeness.
  const r = await identityDb.query(
    "INSERT INTO business_owners(business_id, user_id, owner_type, status) VALUES ($1,$2,$3,'active') RETURNING id, business_id, user_id, owner_type, status, created_at",
    [business_id, user_id, owner_type]
  );
  return r.rows[0];
}

module.exports = { addOwner };