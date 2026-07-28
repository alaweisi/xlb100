import { closeMysqlPool } from "../dal/mysqlPool.js";
import { runStagingDemoBootstrap } from "./stagingDemoBootstrap.js";

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const apply = flags.has("--apply");
if (
  dryRun === apply
  || [...flags].some((flag) => !["--dry-run", "--apply"].includes(flag))
) {
  throw new Error("usage: stagingDemoBootstrapCli (--dry-run | --apply)");
}

try {
  const summary = await runStagingDemoBootstrap({ dryRun });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`staging demo bootstrap failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await closeMysqlPool();
}
