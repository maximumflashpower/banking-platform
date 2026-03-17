import { buildSessionsRepo } from "./sessionsRepo.js";

const SOCIAL_SESSION_TTL_HOURS = 24;

export async function createSocialSession({ db, userId, deviceId = null }) {
  const repo = buildSessionsRepo(db);
  const expiresAt = new Date(Date.now() + SOCIAL_SESSION_TTL_HOURS * 60 * 60 * 1000);

  return repo.createSession({
    userId,
    sessionType: "social_session",
    deviceId,
    expiresAt,
  });
}