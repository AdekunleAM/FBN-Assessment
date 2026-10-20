import { Db } from "../types";

export interface ClearResult {
  walletsCleared: number;
  transfersCleared: number;
  idempotencyKeysCleared: number;
  usersCleared: number;
  adminUsersPreserved: number;
}

// Wipes every mutable collection except admin users (isAdmin: true) - in
// practice just the one seeded default user, but written generically in
// case more than one admin ever exists.
export function clearAllDataExceptAdmin(db: Db): ClearResult {
  const walletsCleared = Object.keys(db.wallets).length;
  const transfersCleared = db.transfers.length;
  const idempotencyKeysCleared = Object.keys(db.idempotencyKeys).length;

  const adminUsers = Object.values(db.users).filter((u) => u.isAdmin);
  const usersCleared = Object.keys(db.users).length - adminUsers.length;

  db.wallets = {};
  db.transfers = [];
  db.idempotencyKeys = {};
  db.users = {};
  for (const admin of adminUsers) {
    db.users[admin.id] = admin;
  }

  return {
    walletsCleared,
    transfersCleared,
    idempotencyKeysCleared,
    usersCleared,
    adminUsersPreserved: adminUsers.length,
  };
}
