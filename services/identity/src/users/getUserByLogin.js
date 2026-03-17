import { buildUsersRepo } from "./usersRepo.js";

export async function getUserByLogin({ db, login }) {
  const usersRepo = buildUsersRepo(db);
  return usersRepo.getUserByLogin(login);
}