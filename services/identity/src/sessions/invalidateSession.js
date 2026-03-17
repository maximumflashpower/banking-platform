import { buildSessionsRepo } from "./sessionsRepo.js";

export async function invalidateSession({ db, sessionId, reason = "logout" }) {
  const repo = buildSessionsRepo(db);
  return repo.invalidateSession(sessionId, reason);
}