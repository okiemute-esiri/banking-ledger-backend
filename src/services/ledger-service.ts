import { randomUUID } from "node:crypto";
import type { Account, CreateAccountInput } from "../domain/account.js";
import { naturalDebit } from "../domain/account.js";
import { LedgerError } from "../domain/errors.js";
import type { CreateJournalEntryInput, JournalEntry, Posting } from "../domain/journal-entry.js";
import { totals } from "../domain/journal-entry.js";
import { InMemoryLedgerRepository } from "../repositories/in-memory-ledger-repository.js";

function postingsEqual(left: Posting[], right: Posting[]): boolean {
  if (left.length !== right.length) return false;

  return left.every((posting, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      posting.accountId === other.accountId &&
      posting.side === other.side &&
      posting.amountMinor === other.amountMinor
    );
  });
}

function sameRequest(existing: JournalEntry, input: CreateJournalEntryInput): boolean {
  return existing.description === input.description && postingsEqual(existing.postings, input.postings);
}

export class LedgerService {
  constructor(private readonly repository = new InMemoryLedgerRepository()) {}

  createAccount(input: CreateAccountInput): Account {
    const account: Account = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      currency: input.currency.toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    return this.repository.saveAccount(account);
  }

  listAccounts(): Account[] {
    return this.repository.listAccounts();
  }

  getAccount(id: string): Account {
    const account = this.repository.getAccount(id);
    if (!account) throw new LedgerError("Account not found", "ACCOUNT_NOT_FOUND", 404);
    return account;
  }

  postJournalEntry(input: CreateJournalEntryInput): JournalEntry {
    const existing = this.repository.getEntryByReference(input.reference);
    if (existing) {
      if (sameRequest(existing, input)) return existing;
      throw new LedgerError(
        "The transaction reference has already been used for a different request",
        "IDEMPOTENCY_CONFLICT",
        409,
      );
    }

    if (input.postings.length < 2) {
      throw new LedgerError("A journal entry requires at least two postings", "INVALID_POSTINGS", 422);
    }

    const accounts = input.postings.map((posting) => {
      const account = this.getAccount(posting.accountId);
      if (!Number.isSafeInteger(posting.amountMinor) || posting.amountMinor <= 0) {
        throw new LedgerError("Posting amounts must be positive integers", "INVALID_AMOUNT", 422);
      }
      return account;
    });

    const currencies = new Set(accounts.map((account) => account.currency));
    if (currencies.size !== 1) {
      throw new LedgerError(
        "All postings in a journal entry must use accounts with the same currency",
        "CURRENCY_MISMATCH",
        422,
      );
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

    return this.repository.saveEntry(entry);
  }

  listJournalEntries(): JournalEntry[] {
    return this.repository.listEntries();
  }

  getJournalEntry(id: string): JournalEntry {
    const entry = this.repository.getEntry(id);
    if (!entry) throw new LedgerError("Journal entry not found", "ENTRY_NOT_FOUND", 404);
    return entry;
  }

  getBalance(accountId: string): { accountId: string; currency: string; balanceMinor: number } {
    const account = this.getAccount(accountId);
    let debitTotal = 0;
    let creditTotal = 0;

    for (const entry of this.repository.listEntries()) {
      for (const posting of entry.postings) {
        if (posting.accountId !== accountId) continue;
        if (posting.side === "DEBIT") debitTotal += posting.amountMinor;
        else creditTotal += posting.amountMinor;
      }
    }

    const balanceMinor = naturalDebit(account.type)
      ? debitTotal - creditTotal
      : creditTotal - debitTotal;

    return { accountId, currency: account.currency, balanceMinor };
  }
}
