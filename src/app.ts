import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { LedgerError } from "./domain/errors.js";
import { LedgerService } from "./services/ledger-service.js";

const accountSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  currency: z.string().trim().length(3),
});

const postingSchema = z.object({
  accountId: z.string().uuid(),
  side: z.enum(["DEBIT", "CREDIT"]),
  amountMinor: z.number().int().positive(),
});

const journalEntrySchema = z.object({
  reference: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  postings: z.array(postingSchema).min(2),
});

type ReadinessCheck = () => Promise<void>;

export function createApp(service = new LedgerService(), readinessCheck: ReadinessCheck = async () => undefined) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    try {
      await readinessCheck();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready", error: { code: "DEPENDENCY_UNAVAILABLE", message: "A required dependency is unavailable" } });
    }
  });

  app.post("/api/v1/accounts", async (req, res, next) => {
    try {
      const input = accountSchema.parse(req.body);
      res.status(201).json({ data: await service.createAccount(input) });
    } catch (error) { next(error); }
  });

  app.get("/api/v1/accounts", async (_req, res, next) => {
    try { res.json({ data: await service.listAccounts() }); } catch (error) { next(error); }
  });

  app.get("/api/v1/accounts/:accountId", async (req, res, next) => {
    try { res.json({ data: await service.getAccount(req.params.accountId) }); } catch (error) { next(error); }
  });

  app.get("/api/v1/accounts/:accountId/balance", async (req, res, next) => {
    try { res.json({ data: await service.getBalance(req.params.accountId) }); } catch (error) { next(error); }
  });

  app.post("/api/v1/journal-entries", async (req, res, next) => {
    try {
      const input = journalEntrySchema.parse(req.body);
      res.status(201).json({ data: await service.postJournalEntry(input) });
    } catch (error) { next(error); }
  });

  app.get("/api/v1/journal-entries", async (_req, res, next) => {
    try { res.json({ data: await service.listJournalEntries() }); } catch (error) { next(error); }
  });

  app.get("/api/v1/journal-entries/:entryId", async (req, res, next) => {
    try { res.json({ data: await service.getJournalEntry(req.params.entryId) }); } catch (error) { next(error); }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues } });
    }
    if (error instanceof LedgerError) {
      return res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    }
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
  });

  return app;
}
