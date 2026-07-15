import { spawnSync } from "node:child_process";

const probe = spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
if (probe.status !== 0) {
  process.exit(0);
}

const configured = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});
if (configured.status !== 0) {
  process.exit(configured.status ?? 1);
}

console.log("XLB Git hooks installed: core.hooksPath=.githooks");
