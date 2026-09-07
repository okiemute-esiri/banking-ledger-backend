import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PostgresLedgerRepository } from "../src/repositories/postgres-ledger-repository.js";
import { LedgerService } from "../src/services/ledger-service.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("PostgreSQL ledger persistence", () => {
  it("persists accounts and enforces durable idempotency across repository instances", async () => {
    const repo1 = new PostgresLedgerRepository(databaseUrl!);
    const repo2 = new PostgresLedgerRepository(databaseUrl!);
    await repo1.initialize();
    await repo2.initialize();

    try {
      const service1 = new LedgerService(repo1);
      const service2 = new LedgerService(repo2);
      const suffix = randomUUID();

      const cash = await service1.createAccount({ name: `Cash ${suffix}`, type: "ASSET", currency: "EUR" });
      const revenue = await service1.createAccount({ name: `Revenue ${suffix}`, type: "REVENUE", currency: "EUR" });

      expect((await service2.getAccount(cash.id)).id).toBe(cash.id);

      const input = {
        reference: `PG-${suffix}`,
        description: "Durable customer payment",
        postings: [
          { accountId: cash.id, side: "DEBIT" as const, amountMinor: 12500 },
          { accountId: revenue.id, side: "CREDIT" as const, amountMinor: 12500 },
        ],
      };

      const first = await service1.postJournalEntry(input);
      const retry = await service2.postJournalEntry(input);
      expect(retry.id).toBe(first.id);

      await expect(service2.postJournalEntry({
        ...input,
        description: "Changed request",
      })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });

      expect((await service2.getBalance(cash.id)).balanceMinor).toBe(12500);
    } finally {
      await repo1.close();
      await repo2.close();
    }
  });
});
