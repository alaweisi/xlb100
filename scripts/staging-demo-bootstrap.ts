const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const apply = flags.has("--apply");
if (dryRun === apply || [...flags].some((flag) => !["--dry-run", "--apply"].includes(flag))) {
  throw new Error("usage: pnpm exec tsx scripts/staging-demo-bootstrap.ts (--dry-run | --apply)");
}

async function main(): Promise<void> {
  const [{ runStagingDemoBootstrap }, { closeMysqlPool }] = await Promise.all([
    import("../backend/src/demo/stagingDemoBootstrap.js"),
    import("../backend/src/dal/mysqlPool.js"),
  ]);
  try {
    const summary = await runStagingDemoBootstrap({ dryRun });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await closeMysqlPool();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`staging demo bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
