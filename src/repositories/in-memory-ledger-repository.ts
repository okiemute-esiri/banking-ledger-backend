import type { Account } from "../domain/account.js";
import type { JournalEntry } from "../domain/journal-entry.js";
import { DuplicateReferenceError, type LedgerRepository } from "./ledger-repository.js";

export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly accounts = new Map<string, Account>();
  private readonly entries = new Map<string, JournalEntry>();
  private readonly references = new Map<string, string>();

  async saveAccount(account: Account): Promise<Account> {
    this.accounts.set(account.id, account);
    return account;
  }

  async getAccount(id: string): Promise<Account | undefined> {
    return this.accounts.get(id);
  }

  async listAccounts(): Promise<Account[]> {
    return [...this.accounts.values()];
  }

  async saveEntry(entry: JournalEntry): Promise<JournalEntry> {
    if (this.references.has(entry.reference)) {
      throw new DuplicateReferenceError(entry.reference);
    }
    this.entries.set(entry.id, entry);
    this.references.set(entry.reference, entry.id);
    return entry;
  }

  async getEntry(id: string): Promise<JournalEntry | undefined> {
    return this.entries.get(id);
  }

  async getEntryByReference(reference: string): Promise<JournalEntry | undefined> {
    const id = this.references.get(reference);
    return id ? this.entries.get(id) : undefined;
  }

  async listEntries(): Promise<JournalEntry[]> {
    return [...this.entries.values()];
  }
}
