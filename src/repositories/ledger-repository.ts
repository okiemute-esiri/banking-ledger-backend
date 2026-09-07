import type { Account } from "../domain/account.js";
import type { JournalEntry } from "../domain/journal-entry.js";

export class DuplicateReferenceError extends Error {
  constructor(public readonly reference: string) {
    super(`Journal reference already exists: ${reference}`);
    this.name = "DuplicateReferenceError";
  }
}

export interface LedgerRepository {
  saveAccount(account: Account): Promise<Account>;
  getAccount(id: string): Promise<Account | undefined>;
  listAccounts(): Promise<Account[]>;
  saveEntry(entry: JournalEntry): Promise<JournalEntry>;
  getEntry(id: string): Promise<JournalEntry | undefined>;
  getEntryByReference(reference: string): Promise<JournalEntry | undefined>;
  listEntries(): Promise<JournalEntry[]>;
}
