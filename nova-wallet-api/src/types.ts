export interface Wallet {
  id: string;
  balanceKobo: number;
  createdAt: string;
  dailyOutbound: {
    watDate: string; // YYYY-MM-DD in WAT (UTC+1), day the counter applies to
    totalKobo: number;
  };
}

export interface Transfer {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amountKobo: number;
  idempotencyKey: string;
  createdAt: string;
}

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string; // "salt:hash", never the plaintext password
  createdAt: string;
  isAdmin: boolean; // true only for the seeded default user; survives POST /admin/clear
}

export interface Db {
  wallets: Record<string, Wallet>;
  transfers: Transfer[];
  idempotencyKeys: Record<string, IdempotencyRecord>;
  users: Record<string, User>;
}
