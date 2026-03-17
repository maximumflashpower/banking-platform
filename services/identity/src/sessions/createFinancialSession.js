import { buildSessionsRepo } from "./sessionsRepo.js";

const FINANCIAL_SESSION_TTL_MINUTES = 30;

export async function createFinancialSession({
  db,
  userId,
  spaceId,
  deviceId = null,
}) {
  if (!spaceId) {
    throw new Error("space_id_required");
  }

  const repo = buildSessionsRepo(db);
  const expiresAt = new Date(Date.now() + FINANCIAL_SESSION_TTL_MINUTES * 60 * 1000);

  return repo.createSession({
    userId,
    sessionType: "financial_session",
    spaceId,
    deviceId,
    expiresAt,
  });
}