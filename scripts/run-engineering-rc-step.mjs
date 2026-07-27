import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_KILL_GRACE_MS = 2_000;
const COMMAND_NOT_FOUND_EXIT_CODE = 127;
const TIMEOUT_EXIT_CODE = 124;

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function signalExitCode(signal) {
  const signalNumber = osConstants.signals[signal];
  return Number.isInteger(signalNumber) ? 128 + signalNumber : 1;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", finish);
      resolve(false);
    }, timeoutMs);
    timer.unref?.();
    child.once("exit", finish);
  });
}

function killPosixProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      try {
        child.kill(signal);
      } catch (childError) {
        if (childError?.code !== "ESRCH") throw childError;
      }
    }
  }
}

export function taskkillProcessTree(
  pid,
  timeoutMs,
  spawnImpl = spawn,
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const killer = spawnImpl(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    killer.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    killer.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`taskkill failed with exit code ${code ?? 1}`));
      }
    });
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killer.kill();
      reject(new Error(`taskkill exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

function posixProcessGroupExists(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitForPosixProcessGroupExit(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!posixProcessGroupExists(processGroupId)) return true;
    await delay(25);
  }
  return !posixProcessGroupExists(processGroupId);
}

export async function terminateEngineeringRcProcessTree(
  child,
  {
    killGraceMs = DEFAULT_KILL_GRACE_MS,
    taskkillTimeoutMs = 30_000,
    taskkillSpawn = spawn,
  } = {},
) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    try {
      await taskkillProcessTree(
        child.pid,
        taskkillTimeoutMs,
        taskkillSpawn,
      );
    } catch (error) {
      try {
        child.kill("SIGKILL");
      } catch {
        // The fail-closed error below is authoritative.
      }
      throw error;
    }
    if (!await waitForExit(child, killGraceMs)) {
      throw new Error("Windows process tree did not exit after taskkill");
    }
    return;
  }

  killPosixProcessGroup(child, "SIGTERM");
  if (await waitForPosixProcessGroupExit(child.pid, killGraceMs)) return;
  killPosixProcessGroup(child, "SIGKILL");
  if (
    !await waitForPosixProcessGroupExit(
      child.pid,
      Math.max(Math.min(killGraceMs, 1_000), 100),
    )
  ) {
    throw new Error("POSIX process tree did not exit after SIGKILL");
  }
}

export function runEngineeringRcStep({
  command,
  args = [],
  timeoutMs,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
  cwd = process.cwd(),
  env = process.env,
  stdio = "inherit",
} = {}) {
  if (typeof command !== "string" || command.length === 0) {
    throw new TypeError("command must be a non-empty string");
  }
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    throw new TypeError("args must be an array of strings");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive integer");
  }
  if (!Number.isInteger(killGraceMs) || killGraceMs < 0) {
    throw new TypeError("killGraceMs must be a non-negative integer");
  }

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let interrupted = false;
    let timeout;
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      process.off("SIGINT", handleSigint);
      process.off("SIGTERM", handleSigterm);
      resolve(result);
    };

    child.once("error", (error) => {
      if (timedOut || interrupted) return;
      finish({
        exitCode: error?.code === "ENOENT" ? COMMAND_NOT_FOUND_EXIT_CODE : 1,
        signal: null,
        timedOut: false,
        error,
      });
    });

    child.once("exit", (code, signal) => {
      if (timedOut || interrupted) return;
      finish({
        exitCode: Number.isInteger(code) ? code : signalExitCode(signal),
        signal,
        timedOut: false,
        error: null,
      });
    });

    const interrupt = async (signal) => {
      if (settled || timedOut || interrupted) return;
      interrupted = true;
      try {
        await terminateEngineeringRcProcessTree(child, { killGraceMs });
        finish({
          exitCode: signalExitCode(signal),
          signal,
          timedOut: false,
          error: null,
        });
      } catch (error) {
        finish({
          exitCode: signalExitCode(signal),
          signal,
          timedOut: false,
          error,
        });
      }
    };
    const handleSigint = () => {
      void interrupt("SIGINT");
    };
    const handleSigterm = () => {
      void interrupt("SIGTERM");
    };
    process.once("SIGINT", handleSigint);
    process.once("SIGTERM", handleSigterm);

    timeout = setTimeout(async () => {
      timedOut = true;
      try {
        await terminateEngineeringRcProcessTree(child, { killGraceMs });
        finish({
          exitCode: TIMEOUT_EXIT_CODE,
          signal: null,
          timedOut: true,
          error: null,
        });
      } catch (error) {
        finish({
          exitCode: TIMEOUT_EXIT_CODE,
          signal: null,
          timedOut: true,
          error,
        });
      }
    }, timeoutMs);
  });
}

function parseCli(argv) {
  let timeoutMs;
  let killGraceMs = DEFAULT_KILL_GRACE_MS;
  let index = 0;
  for (; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      index += 1;
      break;
    }
    if (argument === "--timeout-ms") {
      timeoutMs = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (argument === "--kill-grace-ms") {
      killGraceMs = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${argument}`);
  }
  const [command, ...args] = argv.slice(index);
  return { command, args, timeoutMs, killGraceMs };
}

async function runCli() {
  try {
    const result = await runEngineeringRcStep(parseCli(process.argv.slice(2)));
    if (result.error) {
      process.stderr.write(`[engineering-rc-step] ${result.error.message}\n`);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(
      `Usage: node scripts/run-engineering-rc-step.mjs --timeout-ms <ms> [--kill-grace-ms <ms>] -- <command> [args...]\n${error.message}\n`,
    );
    process.exitCode = 2;
  }
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await runCli();
