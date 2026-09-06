import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function createAccount(
  app: ReturnType<typeof createApp>,
  name: string,
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
  currency = "EUR",
) {
  const response = await request(app).post("/api/v1/accounts").send({ name, type, currency });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

describe("banking ledger API", () => {
  it("posts a balanced journal entry and projects balances", async () => {
    const app = createApp();
    const cash = await createAccount(app, "Operating Cash", "ASSET");
    const revenue = await createAccount(app, "Sales Revenue", "REVENUE");

    const post = await request(app).post("/api/v1/journal-entries").send({
      reference: "PAYMENT-001",
      description: "Customer payment",
      postings: [
        { accountId: cash.id, side: "DEBIT", amountMinor: 10000 },
        { accountId: revenue.id, side: "CREDIT", amountMinor: 10000 },
      ],
    });

    expect(post.status).toBe(201);

    const cashBalance = await request(app).get(`/api/v1/accounts/${cash.id}/balance`);
    const revenueBalance = await request(app).get(`/api/v1/accounts/${revenue.id}/balance`);

    expect(cashBalance.body.data.balanceMinor).toBe(10000);
    expect(revenueBalance.body.data.balanceMinor).toBe(10000);
  });

  it("rejects an unbalanced journal entry", async () => {
    const app = createApp();
    const cash = await createAccount(app, "Operating Cash", "ASSET");
    const revenue = await createAccount(app, "Sales Revenue", "REVENUE");

    const response = await request(app).post("/api/v1/journal-entries").send({
      reference: "BAD-ENTRY",
      description: "Invalid entry",
      postings: [
        { accountId: cash.id, side: "DEBIT", amountMinor: 10000 },
        { accountId: revenue.id, side: "CREDIT", amountMinor: 9000 },
      ],
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("UNBALANCED_ENTRY");
  });

  it("treats an identical repeated reference as an idempotent retry", async () => {
    const app = createApp();
    const cash = await createAccount(app, "Operating Cash", "ASSET");
    const revenue = await createAccount(app, "Sales Revenue", "REVENUE");
    const payload = {
      reference: "IDEMPOTENT-001",
      description: "Safe retry",
      postings: [
        { accountId: cash.id, side: "DEBIT", amountMinor: 5000 },
        { accountId: revenue.id, side: "CREDIT", amountMinor: 5000 },
      ],
    };

    const first = await request(app).post("/api/v1/journal-entries").send(payload);
    const second = await request(app).post("/api/v1/journal-entries").send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it("rejects reuse of an idempotency reference with a different payload", async () => {
    const app = createApp();
    const cash = await createAccount(app, "Operating Cash", "ASSET");
    const revenue = await createAccount(app, "Sales Revenue", "REVENUE");

    const first = await request(app).post("/api/v1/journal-entries").send({
      reference: "IDEMPOTENT-CONFLICT-001",
      description: "Original payment",
      postings: [
        { accountId: cash.id, side: "DEBIT", amountMinor: 5000 },
        { accountId: revenue.id, side: "CREDIT", amountMinor: 5000 },
      ],
    });

    const second = await request(app).post("/api/v1/journal-entries").send({
      reference: "IDEMPOTENT-CONFLICT-001",
      description: "Changed payment",
      postings: [
        { accountId: cash.id, side: "DEBIT", amountMinor: 7000 },
        { accountId: revenue.id, side: "CREDIT", amountMinor: 7000 },
      ],
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects cross-currency journal entries", async () => {
    const app = createApp();
    const euroCash = await createAccount(app, "EUR Cash", "ASSET", "EUR");
    const dollarRevenue = await createAccount(app, "USD Revenue", "REVENUE", "USD");

    const response = await request(app).post("/api/v1/journal-entries").send({
      reference: "FX-NOT-SUPPORTED-001",
      description: "Cross-currency posting",
      postings: [
        { accountId: euroCash.id, side: "DEBIT", amountMinor: 10000 },
        { accountId: dollarRevenue.id, side: "CREDIT", amountMinor: 10000 },
      ],
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("CURRENCY_MISMATCH");
  });

  it("uses natural credit balances for liabilities", async () => {
    const app = createApp();
    const cash = await createAccount(app, "Cash", "ASSET");
    const payable = await createAccount(app, "Accounts Payable", "LIABILITY");

    await request(app).post("/api/v1/journal-entries").send({
      reference: "LIABILITY-001",
      description: "Record payable",
      postings: [
        { accountId: cash.id, side: "DEBIT", amountMinor: 2500 },
        { accountId: payable.id, side: "CREDIT", amountMinor: 2500 },
      ],
    });

    const balance = await request(app).get(`/api/v1/accounts/${payable.id}/balance`);
    expect(balance.status).toBe(200);
    expect(balance.body.data.balanceMinor).toBe(2500);
  });
});
