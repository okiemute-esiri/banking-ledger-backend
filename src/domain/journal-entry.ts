export type PostingSide = "DEBIT" | "CREDIT";

export interface Posting {
  accountId: string;
  side: PostingSide;
  amountMinor: number;
}

export interface JournalEntry {
  id: string;
  reference: string;
  description: string;
  postings: Posting[];
  createdAt: string;
}

export interface CreateJournalEntryInput {
  reference: string;
  description: string;
  postings: Posting[];
}

export function totals(postings: Posting[]): { debits: number; credits: number } {
  return postings.reduce(
    (acc, posting) => {
      if (posting.side === "DEBIT") acc.debits += posting.amountMinor;
      else acc.credits += posting.amountMinor;
      return acc;
    },
    { debits: 0, credits: 0 },
  );
}
