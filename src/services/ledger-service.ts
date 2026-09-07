import { randomUUID } from "node:crypto";
import type { Account, CreateAccountInput } from "../domain/account.js";
import { naturalDebit } from "../domain/account.js";
import { LedgerError } from "../domain/errors.js";
import type { CreateJournalEntryInput, JournalEntry, Posting } from "../domain/journal-entry.js";
import { totals } from "../domain/journal-entry.js";
import { InMemoryLedgerRepository } from "../repositories/in-memory-ledger-repository.js";
import { DuplicateReferenceError, type LedgerRepository } from "../repositories/ledger-repository.js";

function postingsEqual(left: Posting[], right: Posting[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((posting, index) => {
    const other = right[index];
    return other !== undefined && posting.accountId === other.accountId && posting.side === other.side && posting.amountMinor === other.amountMinor;
  });
}

function sameRequest(existing: JournalEntry, input: CreateJournalEntryInput): boolean {
  return existing.description === input.description && postingsEqual(existing.postings, input.postings);
}

export class LedgerService {
  constructor(private readonly repository: LedgerRepository = new InMemoryLedgerRepository()) {}

  async createAccount(input: CreateAccountInput): Promise<Account> {
    return this.repository.saveAccount({
      id: randomUUID(),
      name: input.name,
      type: input.type,
      currency: input.currency.toUpperCase(),
      createdAt: new Date().toISOString(),
    });
  }

  listAccounts(): Promise<Account[]> {
    return this.repository.listAccounts();
  }

  async getAccount(id: string): Promise<Account> {
    const account = await this.repository.getAccount(id);
    if (!account) throw new LedgerError("Account not found", "ACCOUNT_NOT_FOUND", 404);
    return account;
  }

  async postJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
    const existing = await this.repository.getEntryByReference(input.reference);
    if (existing) {
      if (sameRequest(existing, input)) return existing;
      throw new LedgerError("The transaction reference has already been used for a different request", "IDEMPOTENCY_CONFLICT", 409);
    }

    if (input.postings.length < 2) {
      throw new LedgerError("A journal entry requires at least two postings", "INVALID_POSTINGS", 422);
    }

    const accounts: Account[] = [];
    for (const posting of input.postings) {
      if (!Number.isSafeInteger(posting.amountMinor) || posting.amountMinor <= 0) {
        throw new LedgerError("Posting amounts must be positive integers", "INVALID_AMOUNT", 422);
      }
      accounts.push(await this.getAccount(posting.accountId));
    }

    if (new Set(accounts.map((account) => account.currency)).size !== 1) {
      throw new LedgerError("All postings in a journal entry must use accounts with the same currency", "CURRENCY_MISMATCH", 422);
    }

    const { debits, credits } = totals(input.postings);
    if (debits !== credits) {
      throw new LedgerError("Journal entry is not balanced", "UNBALANCED_ENTRY", 422);
    }

    const entry: JournalEntry = {
      id: randomUUID(),
      reference: input.reference,
      description: input.description,
      postings: input.postings.map((posting) => ({ ...posting })),
      createdAt: new Date().toISOString(),
    };

    try {
      return await this.repository.saveEntry(entry);
    } catch (error) {
      if (!(error instanceof DuplicateReferenceError)) throw error;
      const concurrent = await this.repository.getEntryByReference(input.reference);
      if (concurrent && sameRequest(concurrent, input)) return concurrent;
      throw new LedgerError("The transaction reference has already been used for a different request", "IDEMPOTENCY_CONFLICT", 409);
    }
  }

  listJournalEntries(): Promise<JournalEntry[]> {
    return this.repository.listEntries();
  }

  async getJournalEntry(id: string): Promise<JournalEntry> {
    const entry = await this.repository.getEntry(id);
    if (!entry) throw new LedgerError("Journal entry not found", "ENTRY_NOT_FOUND", 404);
    return entry;
  }

  async getBalance(accountId: string): Promise<{ accountId: string; currency: string; balanceMinor: number }> {
    const account = await this.getAccount(accountId);
    let debitTotal = 0;
    let creditTotal = 0;

    for (const entry of await this.repository.listEntries()) {
      for (const posting of entry.postings) {
        if (posting.accountId !== accountId) continue;
        if (posting.side === "DEBIT") debitTotal += posting.amountMinor;
        else creditTotal += posting.amountMinor;
      }
    }

    const balanceMinor = naturalDebit(account.type) ? debitTotal - creditTotal : creditTotal - debitTotal;
    return { accountId, currency: account.currency, balanceMinor };
  }
}
