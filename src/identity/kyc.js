"use strict";

const { queryIdentity } = require("./identityDb");

function now() {
  return new Date().toISOString();
}

async function ensureProfile(userId) {
  await queryIdentity(
    `
    insert into kyc_profiles (user_id, status)
    values ($1, 'unverified')
    on conflict (user_id) do nothing
    `,
    [String(userId)]
  );
}

async function getStatus(userId) {
  await ensureProfile(userId);

  const r = await queryIdentity(
    `
    select user_id, status, provider, provider_ref,
           started_at, submitted_at, verified_at, rejected_at,
           rejection_reason, created_at, updated_at
    from kyc_profiles
    where user_id=$1
    `,
    [String(userId)]
  );

  const row = r.rows[0];
  return {
    userId: row.user_id,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref,
    timestamps: {
      startedAt: row.started_at ? row.started_at.toISOString?.() || row.started_at : null,
      submittedAt: row.submitted_at ? row.submitted_at.toISOString?.() || row.submitted_at : null,
      verifiedAt: row.verified_at ? row.verified_at.toISOString?.() || row.verified_at : null,
      rejectedAt: row.rejected_at ? row.rejected_at.toISOString?.() || row.rejected_at : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    },
    rejectionReason: row.rejection_reason || null,
  };
}

async function startKyc(userId) {
  await ensureProfile(userId);

  // Only allow start from unverified/rejected (idempotent-ish)
  const r = await queryIdentity(
    `
    update kyc_profiles
    set status='pending',
        started_at = coalesce(started_at, now()),
        provider='stub',
        provider_ref = coalesce(provider_ref, $2)
    where user_id=$1
      and status in ('unverified','rejected')
    returning user_id, status, provider, provider_ref
    `,
    [String(userId), `kyc_stub_${String(userId).slice(-8)}_${Date.now()}`]
  );

  if (r.rowCount === 0) {
    // already pending/verified; return current
    return getStatus(userId);
  }
  return getStatus(userId);
}

async function submitKyc(userId, payload) {
  await ensureProfile(userId);

  // MVP stub: submit moves pending -> verified (or rejected if requested)
  const decision = String(payload?.decision || "verify").toLowerCase(); // "verify" | "reject"
  const rejectionReason = payload?.rejection_reason ? String(payload.rejection_reason) : null;

  if (decision !== "verify" && decision !== "reject") {
    const err = new Error("invalid_decision");
    err.code = "BAD_REQUEST";
    throw err;
  }

  // Must be pending to submit in MVP
  const cur = await queryIdentity(`select status from kyc_profiles where user_id=$1`, [String(userId)]);
  const status = cur.rows?.[0]?.status;
  if (status !== "pending") {
    const err = new Error("kyc_not_pending");
    err.code = "CONFLICT";
    throw err;
  }

  if (decision === "verify") {
    await queryIdentity(
      `
      update kyc_profiles
      set status='verified',
          submitted_at = coalesce(submitted_at, now()),
          verified_at = coalesce(verified_at, now()),
          rejected_at = null,
          rejection_reason = null
      where user_id=$1
      `,
      [String(userId)]
    );
  } else {
    await queryIdentity(
      `
      update kyc_profiles
      set status='rejected',
          submitted_at = coalesce(submitted_at, now()),
          rejected_at = coalesce(rejected_at, now()),
          verified_at = null,
          rejection_reason = $2
      where user_id=$1
      `,
      [String(userId), rejectionReason || "manual_reject"]
    );
  }

  return getStatus(userId);
}

async function requireKycVerified(userId) {
  await ensureProfile(userId);
  const r = await queryIdentity(`select status from kyc_profiles where user_id=$1`, [String(userId)]);
  const status = r.rows[0].status;
  return status === "verified";
}

module.exports = { getStatus, startKyc, submitKyc, requireKycVerified };