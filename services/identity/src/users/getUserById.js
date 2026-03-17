import { buildUsersRepo } from "./usersRepo.js";

export async function getUserById({ db, userId }) {
  const usersRepo = buildUsersRepo(db);
  return usersRepo.getUserById(userId);
}