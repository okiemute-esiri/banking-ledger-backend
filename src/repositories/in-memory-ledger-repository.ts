import type { Account } from "../domain/account.js";
import type { JournalEntry } from "../domain/journal-entry.js";

export class InMemoryLedgerRepository {
  private readonly accounts = new Map<string, Account>();
  private readonly entries = new Map<string, JournalEntry>();
  private readonly references = new Map<string, string>();

  saveAccount(account: Account): Account {
    this.accounts.set(account.id, account);
    return account;
  }

  getAccount(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  listAccounts(): Account[] {
    return [...this.accounts.values()];
  }

  saveEntry(entry: JournalEntry): JournalEntry {
    this.entries.set(entry.id, entry);
    this.references.set(entry.reference, entry.id);
    return entry;
  }

  getEntry(id: string): JournalEntry | undefined {
    return this.entries.get(id);
  }

  getEntryByReference(reference: string): JournalEntry | undefined {
    const id = this.references.get(reference);
    return id ? this.entries.get(id) : undefined;
  }

  listEntries(): JournalEntry[] {
    return [...this.entries.values()];
  }
}
