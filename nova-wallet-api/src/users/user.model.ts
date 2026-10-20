import { v4 as uuidv4 } from "uuid";
import { ApiException } from "../common/exceptions/api.exception";
import { hashPassword, verifyPassword } from "../common/password.util";
import { Db, User } from "../types";

export function findUserByEmail(db: Db, email: string): User | undefined {
  const normalized = email.toLowerCase();
  return Object.values(db.users).find((u) => u.email === normalized);
}

export function createUser(db: Db, args: { email: string; fullName: string; password: string }): User {
  if (findUserByEmail(db, args.email)) {
    throw new ApiException(409, "Email is already registered");
  }
  const user: User = {
    id: uuidv4(),
    email: args.email.toLowerCase(),
    fullName: args.fullName,
    passwordHash: hashPassword(args.password),
    createdAt: new Date().toISOString(),
    isAdmin: false,
  };
  db.users[user.id] = user;
  return user;
}

export function authenticateUser(db: Db, email: string, password: string): User {
  const user = findUserByEmail(db, email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new ApiException(401, "Invalid email or password");
  }
  return user;
}

export function toUserResponse(user: User) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    createdAt: user.createdAt,
  };
}

// Ensures a default user exists on every startup, linked to the static
// API_TOKEN by convention: its credentials are the ones documented for use
// with POST /auth/me when authenticating via the static dev token. Returns
// true only if a user was actually created, so StoreService only persists
// when something changed.
export function seedDefaultUserIfMissing(db: Db): boolean {
  const email = (process.env.DEFAULT_USER_EMAIL || "admin@novapay.dev").toLowerCase();
  if (findUserByEmail(db, email)) {
    return false;
  }
  const fullName = process.env.DEFAULT_USER_FULL_NAME || "NovaPay Default User";
  const password = process.env.DEFAULT_USER_PASSWORD || "novapay-dev-password";
  const user: User = {
    id: uuidv4(),
    email,
    fullName,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    isAdmin: true,
  };
  db.users[user.id] = user;
  return true;
}
