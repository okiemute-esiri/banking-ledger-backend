import { Pool, type PoolClient } from "pg";
import type { Account, AccountType } from "../domain/account.js";
import type { JournalEntry, PostingSide } from "../domain/journal-entry.js";
import { DuplicateReferenceError, type LedgerRepository } from "./ledger-repository.js";

type EntryRow = {
  id: string;
  reference: string;
  description: string;
  created_at: Date;
  account_id: string | null;
  side: PostingSide | null;
  amount_minor: string | null;
  position: number | null;
};

function hydrateEntry(rows: EntryRow[]): JournalEntry | undefined {
  const first = rows[0];
  if (!first) return undefined;
  return {
    id: first.id,
    reference: first.reference,
    description: first.description,
    createdAt: first.created_at.toISOString(),
    postings: rows
      .filter((row) => row.account_id && row.side && row.amount_minor !== null)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((row) => ({ accountId: row.account_id!, side: row.side!, amountMinor: Number(row.amount_minor) })),
  };
}

export class PostgresLedgerRepository implements LedgerRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
        currency char(3) NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal_entries (
        id uuid PRIMARY KEY,
        reference varchar(100) NOT NULL UNIQUE,
        description varchar(500) NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS postings (
        id bigserial PRIMARY KEY,
        entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        position integer NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id),
        side text NOT NULL CHECK (side IN ('DEBIT','CREDIT')),
        amount_minor bigint NOT NULL CHECK (amount_minor > 0),
        UNIQUE(entry_id, position)
      );
      CREATE INDEX IF NOT EXISTS postings_account_id_idx ON postings(account_id);
    `);
  }

  async health(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async saveAccount(account: Account): Promise<Account> {
    await this.pool.query(
      `INSERT INTO accounts (id, name, type, currency, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [account.id, account.name, account.type, account.currency, account.createdAt],
    );
    return account;
  }

  async getAccount(id: string): Promise<Account | undefined> {
    const result = await this.pool.query(`SELECT id, name, type, currency, created_at FROM accounts WHERE id = $1`, [id]);
    const row = result.rows[0] as { id: string; name: string; type: AccountType; currency: string; created_at: Date } | undefined;
    return row ? { id: row.id, name: row.name, type: row.type, currency: row.currency.trim(), createdAt: row.created_at.toISOString() } : undefined;
  }

  async listAccounts(): Promise<Account[]> {
    const result = await this.pool.query(`SELECT id, name, type, currency, created_at FROM accounts ORDER BY created_at, id`);
    return result.rows.map((row: { id: string; name: string; type: AccountType; currency: string; created_at: Date }) => ({
      id: row.id, name: row.name, type: row.type, currency: row.currency.trim(), createdAt: row.created_at.toISOString(),
    }));
  }

  async saveEntry(entry: JournalEntry): Promise<JournalEntry> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO journal_entries (id, reference, description, created_at) VALUES ($1,$2,$3,$4)`, [
        entry.id, entry.reference, entry.description, entry.createdAt,
      ]);
      for (const [position, posting] of entry.postings.entries()) {
        await client.query(
          `INSERT INTO postings (entry_id, position, account_id, side, amount_minor) VALUES ($1,$2,$3,$4,$5)`,
          [entry.id, position, posting.accountId, posting.side, posting.amountMinor],
        );
      }
      await client.query("COMMIT");
      return entry;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") throw new DuplicateReferenceError(entry.reference);
      throw error;
    } finally {
      client.release();
    }
  }

  private async readEntries(where: string, params: unknown[] = []): Promise<JournalEntry[]> {
    const result = await this.pool.query<EntryRow>(
      `SELECT je.id, je.reference, je.description, je.created_at, p.account_id, p.side, p.amount_minor::text, p.position
       FROM journal_entries je LEFT JOIN postings p ON p.entry_id = je.id ${where}
       ORDER BY je.created_at, je.id, p.position`,
      params,
    );
    const grouped = new Map<string, EntryRow[]>();
    for (const row of result.rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
    return [...grouped.values()].map((rows) => hydrateEntry(rows)!).filter(Boolean);
  }

  async getEntry(id: string): Promise<JournalEntry | undefined> {
    return (await this.readEntries("WHERE je.id = $1", [id]))[0];
  }

  async getEntryByReference(reference: string): Promise<JournalEntry | undefined> {
    return (await this.readEntries("WHERE je.reference = $1", [reference]))[0];
  }

  async listEntries(): Promise<JournalEntry[]> {
    return this.readEntries("");
  }
}
