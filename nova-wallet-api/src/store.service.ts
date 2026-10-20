import { Injectable } from "@nestjs/common";
import fs from "node:fs";
import path from "node:path";
import { Db } from "./types";

function emptyDb(): Db {
  return { wallets: {}, transfers: [], idempotencyKeys: {}, users: {} };
}

/**
 * Serializes all read-modify-write operations against the DB so that
 * concurrent requests (e.g. two transfers hitting the same wallet) can't
 * interleave and corrupt balances. Since this is a single-process JSON-file
 * store, a simple in-process promise-chain mutex is sufficient to guarantee
 * atomicity - no external lock manager needed. This guarantees atomicity
 * within one Node process; it would not survive horizontal scaling without
 * moving the lock to Redis/Postgres advisory locks.
 */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

@Injectable()
export class StoreService {
  private readonly dbPath = path.join(__dirname, "..", "data", "db.json");
  private readonly mutex = new Mutex();
  private db: Db;

  constructor() {
    const { db, migrated } = this.load();
    this.db = db;
    // Persist immediately so the on-disk file reflects the current schema
    // right away, rather than waiting on whatever request happens to be the
    // first to trigger a write.
    if (migrated) {
      this.persist();
    }
  }

  private load(): { db: Db; migrated: boolean } {
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      fs.writeFileSync(this.dbPath, JSON.stringify(emptyDb(), null, 2));
    }
    const raw = fs.readFileSync(this.dbPath, "utf-8");
    const db = JSON.parse(raw) as Db;
    let migrated = false;

    // Backward-compatible with a db.json written before the `users`
    // collection existed, so existing wallet/transfer data keeps loading.
    if (!db.users) {
      db.users = {};
      migrated = true;
    }
    // Backward-compatible with a db.json written before `isAdmin` existed:
    // one-time backfill using the email-match heuristic that used to be the
    // only way to identify the admin user. Once `isAdmin` is actually set,
    // it's authoritative - this only fires for pre-existing records that
    // predate the field, so a later DEFAULT_USER_EMAIL change can never
    // "unmark" an already-seeded admin.
    const defaultEmail = (process.env.DEFAULT_USER_EMAIL || "admin@novapay.dev").toLowerCase();
    for (const user of Object.values(db.users)) {
      if (user.isAdmin === undefined) {
        user.isAdmin = user.email === defaultEmail;
        migrated = true;
      }
    }
    return { db, migrated };
  }

  // Write-then-rename keeps db.json from ever being left half-written if the
  // process is killed mid-save.
  private persist(): void {
    const tmpPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmpPath, this.dbPath);
  }

  /**
   * Runs `fn` with exclusive access to the DB. If `fn` throws, no changes are
   * persisted (the in-memory copy is mutated directly, so callers should only
   * mutate after validation has already passed).
   */
  withDb<T>(fn: (db: Db) => T): Promise<T> {
    return this.mutex.run(() => {
      const result = fn(this.db);
      this.persist();
      return result;
    });
  }

  readDb(): Db {
    return this.db;
  }

  /**
   * Runs a synchronous, startup-only mutation (e.g. seeding a default
   * record) directly against the DB without going through the mutex - safe
   * only because this runs during app bootstrap, before any request traffic
   * is possible. Persists only if `mutator` reports an actual change.
   */
  mutateIfNeeded(mutator: (db: Db) => boolean): void {
    const changed = mutator(this.db);
    if (changed) {
      this.persist();
    }
  }
}
