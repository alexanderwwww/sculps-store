/**
 * Who the app has, and which cookie jar belongs to each.
 *
 * Alex runs three Halloween pages for one store, so "one account per
 * platform" was never going to hold. Each account gets its own profile — a
 * separate, persistent website store in the app — and this is the list of
 * them, kept in a small file beside the worker so it survives a restart and
 * an update.
 *
 * A profile id is a UUID because that is what macOS wants for a store of its
 * own. Nothing else about the account is kept here: the handle, the persona
 * and everything learned live in the database, which is the same as before.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_PER_PLATFORM = 5;

export class Accounts {
  constructor(file) {
    this.file = file;
    this.list = [];
  }

  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, "utf8"));
      this.list = Array.isArray(raw?.accounts) ? raw.accounts.filter((a) => a && a.platform && a.profileId) : [];
    } catch {
      this.list = [];
    }
    return this.list;
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ accounts: this.list }, null, 2), "utf8");
  }

  all() {
    return this.list.slice();
  }

  connected() {
    return this.list.filter((a) => a.state === "connected");
  }

  forPlatform(platform) {
    return this.list.filter((a) => a.platform === platform);
  }

  find(id) {
    return this.list.find((a) => a.id === id) ?? null;
  }

  /**
   * A new, empty slot for a platform — its own store, nothing signed in yet.
   * Returns null when there are already as many as the app will hold.
   */
  async add(platform) {
    if (this.forPlatform(platform).length >= MAX_PER_PLATFORM) return null;
    const account = {
      id: `${platform}-${this.forPlatform(platform).length + 1}`,
      platform,
      profileId: randomUUID(),
      handle: null,
      state: "none",
      accountId: null,
      provisional: false,
      addedAt: new Date().toISOString(),
    };
    this.list.push(account);
    await this.save();
    return account;
  }

  async update(id, patch) {
    const a = this.find(id);
    if (!a) return null;
    Object.assign(a, patch);
    await this.save();
    return a;
  }

  /** Forget an account: the app stops using that store. Nothing is deleted from the platform. */
  async remove(id) {
    const before = this.list.length;
    this.list = this.list.filter((a) => a.id !== id);
    if (this.list.length !== before) await this.save();
    return before !== this.list.length;
  }
}

export function accountsIn(dir) {
  return new Accounts(join(dir, "accounts.json"));
}
