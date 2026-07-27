import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  runEngineeringRcStep,
  taskkillProcessTree,
} from "./run-engineering-rc-step.mjs";

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (process.platform === "win32" && error?.code === "EINVAL") return false;
    return true;
  }
}

async function waitForFile(filePath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await delay(20);
  }
  throw new Error(`timed out waiting for ${filePath}`);
}

async function waitForProcessExit(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processExists(pid)) return true;
    await delay(25);
  }
  return !processExists(pid);
}

test("propagates a normal child exit code without a shell", async () => {
  const result = await runEngineeringRcStep({
    command: process.execPath,
    args: ["-e", "process.exit(37)"],
    timeoutMs: 2_000,
    stdio: "ignore",
  });

  assert.equal(result.exitCode, 37);
  assert.equal(result.timedOut, false);
  assert.equal(result.signal, null);
  assert.equal(result.error, null);
});

test("timeout removes a grandchild that ignores SIGTERM", async (t) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "xlb-rc-step-"),
  );
  const pidFile = path.join(temporaryDirectory, "grandchild.pid");
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

  const intermediateProgram = `
    const { spawn } = require("node:child_process");
    const fs = require("node:fs");
    const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], {
      stdio: "ignore"
    });
    fs.writeFileSync(process.argv[1], String(child.pid));
    setInterval(() => {}, 1000);
  `;
  const resultPromise = runEngineeringRcStep({
    command: process.execPath,
    args: ["-e", intermediateProgram, pidFile],
    timeoutMs: 500,
    killGraceMs: 100,
    stdio: "ignore",
  });

  await waitForFile(pidFile);
  const grandchildPid = Number.parseInt(fs.readFileSync(pidFile, "utf8"), 10);
  assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0);

  const result = await resultPromise;
  assert.equal(result.exitCode, 124);
  assert.equal(result.timedOut, true);
  assert.equal(
    await waitForProcessExit(grandchildPid),
    true,
    `grandchild ${grandchildPid} survived the timeout`,
  );
});

test("taskkill has a bounded fail-closed timeout", async () => {
  const killer = new EventEmitter();
  let killed = false;
  killer.kill = () => {
    killed = true;
  };
  await assert.rejects(
    taskkillProcessTree(1234, 25, () => killer),
    /taskkill exceeded 25ms/u,
  );
  assert.equal(killed, true);
});
