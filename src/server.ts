import { createApp } from "./app.js";
import { InMemoryLedgerRepository } from "./repositories/in-memory-ledger-repository.js";
import type { LedgerRepository } from "./repositories/ledger-repository.js";
import { PostgresLedgerRepository } from "./repositories/postgres-ledger-repository.js";
import { LedgerService } from "./services/ledger-service.js";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

let repository: LedgerRepository = new InMemoryLedgerRepository();
let readinessCheck: () => Promise<void> = async () => undefined;
let closeDependencies: () => Promise<void> = async () => undefined;

if (databaseUrl) {
  const postgres = new PostgresLedgerRepository(databaseUrl);
  await postgres.initialize();
  repository = postgres;
  readinessCheck = () => postgres.health();
  closeDependencies = () => postgres.close();
}

const app = createApp(new LedgerService(repository), readinessCheck);
const server = app.listen(port, () => {
  console.log(`banking-ledger-backend listening on port ${port}`);
});

function shutdown(signal: string) {
  console.log(`received ${signal}; shutting down`);
  server.close(async (error) => {
    try {
      await closeDependencies();
    } finally {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
