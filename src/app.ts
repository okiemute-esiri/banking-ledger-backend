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

export function createApp(service = new LedgerService()) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", (_req, res) => res.json({ status: "ready" }));

  app.post("/api/v1/accounts", (req, res, next) => {
    try {
      const input = accountSchema.parse(req.body);
      res.status(201).json({ data: service.createAccount(input) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/accounts", (_req, res) => {
    res.json({ data: service.listAccounts() });
  });

  app.get("/api/v1/accounts/:accountId", (req, res, next) => {
    try {
      res.json({ data: service.getAccount(req.params.accountId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/accounts/:accountId/balance", (req, res, next) => {
    try {
      res.json({ data: service.getBalance(req.params.accountId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/journal-entries", (req, res, next) => {
    try {
      const input = journalEntrySchema.parse(req.body);
      res.status(201).json({ data: service.postJournalEntry(input) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/journal-entries", (_req, res) => {
    res.json({ data: service.listJournalEntries() });
  });

  app.get("/api/v1/journal-entries/:entryId", (req, res, next) => {
    try {
      res.json({ data: service.getJournalEntry(req.params.entryId) });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues },
      });
    }

    if (error instanceof LedgerError) {
      return res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    }

    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
  });

  return app;
}
