import { loadEnv } from "@xlb/config";
import { buildApp } from "./app.js";
import { startAutoRunJobs, type AutoRunHandle } from "./jobs/autoRun.js";

async function main() {
  const env = loadEnv();
  const app = await buildApp();
  let autoRun: AutoRunHandle | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "backend shutdown requested");
    autoRun?.stop();
    try {
      await app.close();
      app.log.info({ signal }, "backend shutdown completed");
      process.exit(0);
    } catch (err) {
      app.log.error({ err, signal }, "backend shutdown failed");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await app.listen({ port: env.backendPort, host: "0.0.0.0" });
    autoRun = startAutoRunJobs({ env, logger: app.log });
  } catch (err) {
    app.log.error(err);
    autoRun?.stop();
    process.exit(1);
  }
}

main();
