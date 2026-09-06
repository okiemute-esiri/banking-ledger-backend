import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
const server = app.listen(port, () => {
  console.log(`banking-ledger-backend listening on port ${port}`);
});

function shutdown(signal: string) {
  console.log(`received ${signal}; shutting down`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
