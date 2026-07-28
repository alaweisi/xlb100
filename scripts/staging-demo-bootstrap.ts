import { runStagingDemoBootstrap } from "../backend/src/demo/stagingDemoBootstrap.js";
import { closeMysqlPool } from "../backend/src/dal/mysqlPool.js";

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const apply = flags.has("--apply");
if (dryRun === apply || [...flags].some((flag) => !["--dry-run", "--apply"].includes(flag))) {
  throw new Error("usage: pnpm exec tsx scripts/staging-demo-bootstrap.ts (--dry-run | --apply)");
}

try {
  const summary = await runStagingDemoBootstrap({ dryRun });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await closeMysqlPool();
}
