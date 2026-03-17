import { buildSessionsRepo } from "./sessionsRepo.js";

export async function getSessionById({ db, sessionId }) {
  const repo = buildSessionsRepo(db);
  return repo.getSessionById(sessionId);
}