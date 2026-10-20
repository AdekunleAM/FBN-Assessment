import { v4 as uuidv4 } from "uuid";
import { ApiException } from "./common/exceptions/api.exception";
import { Db, Wallet } from "./types";
import { watDateString } from "./utils/wat";

// ₦500,000/day, expressed in kobo to match all other monetary fields.
export const DAILY_OUTBOUND_LIMIT_KOBO = 50_000_000;

export function createWallet(db: Db): Wallet {
  const wallet: Wallet = {
    id: uuidv4(),
    balanceKobo: 0,
    createdAt: new Date().toISOString(),
    dailyOutbound: { watDate: watDateString(), totalKobo: 0 },
  };
  db.wallets[wallet.id] = wallet;
  return wallet;
}

export function getWalletOrThrow(db: Db, id: string): Wallet {
  const wallet = db.wallets[id];
  if (!wallet) {
    throw new ApiException(404, `Wallet ${id} not found`);
  }
  return wallet;
}

// Rolls a wallet's outbound counter over to "today" in WAT if the stored
// window is stale. Resets happen lazily on access rather than via a cron,
// since the store has no background scheduler.
export function ensureDailyWindow(wallet: Wallet): void {
  const today = watDateString();
  if (wallet.dailyOutbound.watDate !== today) {
    wallet.dailyOutbound = { watDate: today, totalKobo: 0 };
  }
}

export function creditWallet(db: Db, id: string, amountKobo: number): Wallet {
  const wallet = getWalletOrThrow(db, id);
  wallet.balanceKobo += amountKobo;
  return wallet;
}

export function toWalletResponse(wallet: Wallet) {
  return {
    id: wallet.id,
    balanceKobo: wallet.balanceKobo,
    createdAt: wallet.createdAt,
  };
}
