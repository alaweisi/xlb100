import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateEngineeringRcEvidence } from "./check-engineering-rc-evidence.mjs";
import {
  ENGINEERING_RC_EXCLUSIONS,
  ENGINEERING_RC_GATE,
  ENGINEERING_RC_NODE_VERSION,
  ENGINEERING_RC_PNPM_VERSION,
  ENGINEERING_RC_PROVIDER_ISOLATION,
  ENGINEERING_RC_REQUIRED_STEP_IDS,
  ENGINEERING_RC_STEPS,
  validateEngineeringRcPlan,
} from "./engineering-rc-contract.mjs";
import {
  createMobileSimulationSigning,
  removeMobileSimulationSigning,
} from "./create-mobile-simulation-signing.mjs";
import {
  assertMobileReleasePrerequisites,
} from "./mobile-release-prerequisites.mjs";
import {
  assertEngineeringRcDockerBinding,
  bindEngineeringRcDockerEnvironment,
  createControlledPnpmEnvironment,
  createEngineeringRcEnvironment,
  inspectEngineeringRcDocker,
  resolveControlledPnpmInvocation,
  validateControlledPnpmEnvironment,
} from "./engineering-rc-runtime.mjs";
import { runEngineeringRcStep } from "./run-engineering-rc-step.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export {
  ENGINEERING_RC_EXCLUSIONS,
  ENGINEERING_RC_STEPS,
  createEngineeringRcEnvironment,
  validateEngineeringRcPlan,
};

function capture(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function git(args, environment) {
  return capture("git", args, environment);
}

function hashFile(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeEvidence(filePath, evidence) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  fs.renameSync(temporary, filePath);
}

function tail(filePath, count = 60) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/u).slice(-count).join("\n");
}

function safeError(error) {
  if (error?.code === "ETIMEDOUT") return "step exceeded its canonical timeout";
  return error instanceof Error ? error.message : String(error);
}

function pathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function structuredArtifactDescriptor(kind, sourcePath, artifactRoot, fileName) {
  const repositoryArtifacts = path.join(rootDir, ".artifacts");
  const absoluteSource = path.resolve(sourcePath);
  if (
    !pathInside(repositoryArtifacts, absoluteSource)
    || !fs.existsSync(absoluteSource)
  ) {
    throw new Error(`${kind} evidence is missing or outside .artifacts`);
  }
  const destinationDirectory = path.join(artifactRoot, "structured");
  fs.mkdirSync(destinationDirectory, { recursive: true });
  const destination = path.join(destinationDirectory, fileName);
  if (path.resolve(destination) !== absoluteSource) {
    fs.copyFileSync(absoluteSource, destination);
  }
  return {
    kind,
    path: path.relative(artifactRoot, destination).replaceAll("\\", "/"),
    sha256: hashFile(destination),
  };
}

function markerPath(logText, marker) {
  const matches = [...logText.matchAll(new RegExp(`^${marker}=(.+)$`, "gmu"))];
  return matches.at(-1)?.[1]?.trim() ?? null;
}

function collectStructuredArtifacts(step, logPath, artifactRoot) {
  if (!step.artifact) return [];
  const logText = fs.readFileSync(logPath, "utf8");
  if (step.artifact.kind === "stage4a") {
    const source = markerPath(logText, "STAGE4A_DRILL_EVIDENCE");
    if (!source) throw new Error("Stage 4A did not emit structured evidence");
    return [
      structuredArtifactDescriptor(
        "stage4a",
        source,
        artifactRoot,
        "stage4a.json",
      ),
    ];
  }
  if (step.artifact.kind === "oa-migration") {
    const source = markerPath(logText, "OA_MIGRATION_EVIDENCE");
    if (!source) throw new Error("OA migration did not emit structured evidence");
    return [
      structuredArtifactDescriptor(
        "oa-migration",
        source,
        artifactRoot,
        "oa-migration.json",
      ),
    ];
  }
  if (step.artifact.kind === "mobile-m5") {
    const source = markerPath(logText, "MOBILE_M5_EVIDENCE");
    if (!source) throw new Error("mobile M5 did not emit structured evidence");
    const evidenceDescriptor = structuredArtifactDescriptor(
        "mobile-m5",
        source,
        artifactRoot,
        "mobile-m5.json",
      );
    const evidencePath = path.join(
      artifactRoot,
      evidenceDescriptor.path.replaceAll("/", path.sep),
    );
    const payload = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    if (!Array.isArray(payload.reports) || payload.reports.length !== 3) {
      throw new Error("mobile M5 evidence does not list three APKs");
    }
    const apkDirectory = path.join(artifactRoot, "structured", "apks");
    fs.mkdirSync(apkDirectory, { recursive: true });
    const apkDescriptors = payload.reports.map((report) => {
      if (
        !["customer", "worker", "admin"].includes(report.role)
        || typeof report.apkPath !== "string"
      ) {
        throw new Error("mobile M5 report has an invalid APK descriptor");
      }
      const sourceApk = path.resolve(report.apkPath);
      if (!pathInside(rootDir, sourceApk) || !fs.existsSync(sourceApk)) {
        throw new Error(`mobile M5 ${report.role} APK is missing`);
      }
      const destination = path.join(apkDirectory, `${report.role}.apk`);
      fs.copyFileSync(sourceApk, destination);
      return {
        kind: "mobile-apk",
        role: report.role,
        path: path.relative(artifactRoot, destination).replaceAll("\\", "/"),
        sha256: hashFile(destination),
      };
    });
    return [evidenceDescriptor, ...apkDescriptors];
  }
  if (step.artifact.kind === "playwright") {
    const reportsRoot = path.join(artifactRoot, "playwright");
    const files = fs.existsSync(reportsRoot)
      ? fs.readdirSync(reportsRoot)
        .filter((name) => name.startsWith(step.id) && name.endsWith(".json"))
        .sort()
      : [];
    if (files.length < step.artifact.minimumFiles) {
      throw new Error(
        `${step.id} emitted ${files.length} Playwright reports; expected at least ${step.artifact.minimumFiles}`,
      );
    }
    return files.map((name) => ({
      kind: "playwright",
      path: `playwright/${name}`,
      sha256: hashFile(path.join(reportsRoot, name)),
    }));
  }
  throw new Error(`unsupported artifact policy: ${step.artifact.kind}`);
}

function githubRunProvenance(environment) {
  if (environment.GITHUB_ACTIONS !== "true") return null;
  return {
    repository: environment.GITHUB_REPOSITORY ?? null,
    repositoryId: environment.GITHUB_REPOSITORY_ID ?? null,
    workflowRef: environment.GITHUB_WORKFLOW_REF ?? null,
    workflowSha: environment.GITHUB_WORKFLOW_SHA ?? null,
    runId: environment.GITHUB_RUN_ID ?? null,
    runAttempt: environment.GITHUB_RUN_ATTEMPT ?? null,
    sourceSha: environment.GITHUB_SHA ?? null,
    eventName: environment.GITHUB_EVENT_NAME ?? null,
  };
}

function pnpmEvidence(runtime) {
  return {
    packageManager: runtime.packageManager,
    packageName: runtime.packageName,
    packageVersion: runtime.packageVersion,
    packageIntegrity: runtime.packageIntegrity,
    packageTreeSha256: runtime.packageTreeSha256,
    entrySha256: runtime.entrySha256,
    launcher: {
      packageName: runtime.launcher.packageName,
      packageVersion: runtime.launcher.packageVersion,
      entrySha256: runtime.launcher.entrySha256,
      packageTreeSha256: runtime.launcher.packageTreeSha256,
    },
  };
}

function assertRuntimeBindings(environment, dockerRuntime) {
  const runtimeErrors = validateControlledPnpmEnvironment(environment);
  if (runtimeErrors.length > 0) {
    throw new Error(runtimeErrors.join("; "));
  }
  assertEngineeringRcDockerBinding({
    environment,
    expected: dockerRuntime,
  });
}

function initialEvidence(
  runId,
  artifactRoot,
  pnpmRuntime,
  dockerRuntime,
  environment,
) {
  const commit = git(["rev-parse", "HEAD"], environment);
  const clean =
    git(["status", "--porcelain", "--untracked-files=all"], environment) === "";
  return {
    schemaVersion: 3,
    gate: ENGINEERING_RC_GATE,
    runId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    authorization: {
      evidenceClass: "DIAGNOSTIC_ONLY",
      releaseAuthority:
        "REQUIRES_PROTECTED_CI_SUCCESS_AND_VERIFIED_GITHUB_ATTESTATION",
      githubRun: githubRunProvenance(environment),
    },
    source: {
      commit,
      commitEnd: null,
      cleanBefore: clean,
      cleanAfter: null,
      lockfileSha256: hashFile(path.join(rootDir, "pnpm-lock.yaml")),
    },
    tools: {
      node: process.versions.node,
      pnpm: pnpmRuntime.packageVersion,
      pnpmRuntime: pnpmEvidence(pnpmRuntime),
      docker: dockerRuntime,
      platform: `${process.platform}-${process.arch}`,
      mobile: null,
    },
    scope: {
      included:
        "repository engineering RC, isolated local data reliability, current-source browser acceptance, Android simulation RC",
      exclusions: [...ENGINEERING_RC_EXCLUSIONS],
      realProviderExecution: false,
      providerEnvironment: { ...ENGINEERING_RC_PROVIDER_ISOLATION },
      database: {
        host: environment.MYSQL_HOST,
        port: environment.MYSQL_PORT,
        name: environment.MYSQL_DATABASE,
      },
      redis: {
        host: environment.REDIS_HOST,
        port: environment.REDIS_PORT,
      },
      productionActivation: "NOT_EVALUATED",
      deploymentTarget: "UNDECIDED",
    },
    requiredStepIds: [...ENGINEERING_RC_REQUIRED_STEP_IDS],
    artifactRoot: path.relative(rootDir, artifactRoot).replaceAll("\\", "/"),
    steps: [],
    executionResult: "RUNNING",
    releaseGateEligible: false,
    validationErrors: [],
  };
}

export async function runEngineeringRc() {
  const planErrors = validateEngineeringRcPlan();
  if (planErrors.length > 0) throw new Error(planErrors.join("; "));
  if (process.versions.node !== ENGINEERING_RC_NODE_VERSION) {
    throw new Error(
      `Engineering RC requires Node ${ENGINEERING_RC_NODE_VERSION}; found ${process.versions.node}`,
    );
  }
  let gateEnvironment = createEngineeringRcEnvironment();
  const timestamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  const commit = git(["rev-parse", "HEAD"], gateEnvironment);
  const runId = `${timestamp}-${commit.slice(0, 12)}`;
  const artifactRoot = path.join(
    rootDir,
    ".artifacts",
    "engineering-rc",
    commit,
    runId,
  );
  fs.mkdirSync(artifactRoot, { recursive: true });
  const evidencePath = path.join(artifactRoot, "manifest.json");
  const pnpm = resolveControlledPnpmInvocation({
    root: rootDir,
    environment: gateEnvironment,
  });
  gateEnvironment = createControlledPnpmEnvironment(
    gateEnvironment,
    pnpm,
    { shimRoot: path.join(artifactRoot, "toolchain", "bin") },
  );
  const dockerRuntime = inspectEngineeringRcDocker({
    environment: gateEnvironment,
  });
  gateEnvironment = bindEngineeringRcDockerEnvironment(
    gateEnvironment,
    dockerRuntime,
  );
  const evidence = initialEvidence(
    runId,
    artifactRoot,
    pnpm.metadata,
    dockerRuntime,
    gateEnvironment,
  );
  writeEvidence(evidencePath, evidence);

  if (!evidence.source.cleanBefore) {
    const worktreeStatus = git(
      ["status", "--porcelain", "--untracked-files=all"],
      gateEnvironment,
    );
    evidence.executionResult = "FAIL";
    evidence.completedAt = new Date().toISOString();
    evidence.validationErrors = ["tracked worktree must be clean before the gate"];
    writeEvidence(evidencePath, evidence);
    process.stderr.write(
      `[engineering-rc] FAIL tracked worktree is not clean\n${worktreeStatus}\n`,
    );
    return { ok: false, evidencePath };
  }

  let failed = false;
  let simulationSigning;
  let interruptedSignal;
  const removeSigningAfterSignal = () => {
    if (!simulationSigning) return;
    try {
      removeMobileSimulationSigning(simulationSigning.signingRoot);
    } catch (error) {
      failed = true;
      evidence.validationErrors.push(safeError(error));
    }
  };
  const handleSigint = () => {
    interruptedSignal = "SIGINT";
    removeSigningAfterSignal();
  };
  const handleSigterm = () => {
    interruptedSignal = "SIGTERM";
    removeSigningAfterSignal();
  };
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);
  try {
    simulationSigning = createMobileSimulationSigning({
      environment: gateEnvironment,
    });
    gateEnvironment = {
      ...gateEnvironment,
      ...simulationSigning.environment,
      XLB_PLAYWRIGHT_EVIDENCE_DIR: path.join(artifactRoot, "playwright"),
      XLB_MOBILE_M5_EVIDENCE_PATH: path.join(
        artifactRoot,
        "structured",
        "mobile-m5.json",
      ),
      XLB_OA_MIGRATION_EVIDENCE_PATH: path.join(
        artifactRoot,
        "structured",
        "oa-migration.json",
      ),
    };
    evidence.tools.mobile = assertMobileReleasePrerequisites({
      environment: gateEnvironment,
    });
    writeEvidence(evidencePath, evidence);

    for (const step of ENGINEERING_RC_STEPS) {
      if (interruptedSignal) {
        throw new Error(`engineering RC interrupted by ${interruptedSignal}`);
      }
      const startedAt = new Date();
      const logPath = path.join(
        artifactRoot,
        `${String(evidence.steps.length + 1).padStart(2, "0")}-${step.id}.log`,
      );
      const descriptor = {
        id: step.id,
        stage: step.stage,
        command: [...step.args],
        timeoutMs: step.timeoutMs,
        startedAt: startedAt.toISOString(),
        completedAt: null,
        durationMs: null,
        exitCode: null,
        status: "RUNNING",
        logPath: path.relative(rootDir, logPath).replaceAll("\\", "/"),
        logSha256: null,
        artifacts: [],
      };
      evidence.steps.push(descriptor);
      writeEvidence(evidencePath, evidence);
      process.stdout.write(`\n[engineering-rc] START ${step.stage}/${step.id}\n`);
      const logHandle = fs.openSync(logPath, "w");
      let result;
      let executionError;
      try {
        assertRuntimeBindings(gateEnvironment, dockerRuntime);
        result = await runEngineeringRcStep({
          command: pnpm.command,
          args: [...pnpm.prefix, ...step.args],
          cwd: rootDir,
          env: {
            ...gateEnvironment,
            ...(step.stage === "browser"
              ? { XLB_PLAYWRIGHT_REPORT_ID: step.id }
              : {}),
          },
          stdio: ["ignore", logHandle, logHandle],
          timeoutMs: step.timeoutMs,
          killGraceMs: 5_000,
        });
        assertRuntimeBindings(gateEnvironment, dockerRuntime);
      } catch (error) {
        executionError = error;
      } finally {
        fs.closeSync(logHandle);
      }
      let stepFailure = executionError
        ? safeError(executionError)
        : result?.error
          ? safeError(result.error)
          : null;
      if (!stepFailure && result?.timedOut) {
        stepFailure = "step exceeded its canonical timeout";
      }
      if (!stepFailure && result?.signal) {
        stepFailure = `step interrupted by ${result.signal}`;
      }
      descriptor.exitCode = result?.exitCode ?? 1;
      if (!stepFailure && descriptor.exitCode === 0) {
        try {
          descriptor.artifacts = collectStructuredArtifacts(
            step,
            logPath,
            artifactRoot,
          );
        } catch (error) {
          stepFailure = safeError(error);
          descriptor.exitCode = 1;
        }
      }
      if (stepFailure) {
        fs.appendFileSync(
          logPath,
          `\n[engineering-rc] ${stepFailure}\n`,
          "utf8",
        );
      }
      const completedAt = new Date();
      descriptor.completedAt = completedAt.toISOString();
      descriptor.durationMs = completedAt.getTime() - startedAt.getTime();
      descriptor.status =
        descriptor.exitCode === 0 && !stepFailure ? "PASS" : "FAIL";
      descriptor.logSha256 = hashFile(logPath);
      writeEvidence(evidencePath, evidence);
      process.stdout.write(
        `[engineering-rc] ${descriptor.status} ${step.id} durationMs=${descriptor.durationMs}\n`,
      );
      if (descriptor.status === "FAIL") {
        failed = true;
        process.stderr.write(`${tail(logPath)}\n`);
        break;
      }
    }
    assertRuntimeBindings(gateEnvironment, dockerRuntime);
  } catch (error) {
    failed = true;
    evidence.validationErrors.push(safeError(error));
    process.stderr.write(`[engineering-rc] FAIL ${safeError(error)}\n`);
  } finally {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
    if (simulationSigning) {
      try {
        removeMobileSimulationSigning(simulationSigning.signingRoot);
      } catch (error) {
        failed = true;
        evidence.validationErrors.push(safeError(error));
      }
    }
  }

  evidence.completedAt = new Date().toISOString();
  evidence.source.commitEnd = git(["rev-parse", "HEAD"], gateEnvironment);
  evidence.source.cleanAfter =
    git(["status", "--porcelain", "--untracked-files=all"], gateEnvironment)
    === "";
  evidence.executionResult = !failed
    && evidence.steps.length === ENGINEERING_RC_STEPS.length
    && evidence.source.commitEnd === evidence.source.commit
    && evidence.source.cleanAfter
    ? "PASS"
    : "FAIL";
  if (evidence.executionResult === "PASS") {
    evidence.validationErrors = validateEngineeringRcEvidence(evidence, {
      root: rootDir,
      verifyLogs: true,
    });
    if (evidence.validationErrors.length > 0) {
      evidence.executionResult = "FAIL";
    }
  }
  writeEvidence(evidencePath, evidence);
  process.stdout.write(
    `[engineering-rc] ENGINEERING_RC_EXECUTION=${evidence.executionResult}\n`,
  );
  process.stdout.write(
    "[engineering-rc] EVIDENCE_AUTHORIZATION=DIAGNOSTIC_ONLY\n",
  );
  process.stdout.write("[engineering-rc] RELEASE_GATE_ELIGIBLE=false\n");
  process.stdout.write("[engineering-rc] PRODUCTION_ACTIVATION=NOT_EVALUATED\n");
  process.stdout.write(`ENGINEERING_RC_EVIDENCE=${evidencePath}\n`);
  return { ok: evidence.executionResult === "PASS", evidencePath };
}

async function run() {
  if (process.argv.includes("--list")) {
    process.stdout.write(`${JSON.stringify({
      gate: ENGINEERING_RC_GATE,
      node: ENGINEERING_RC_NODE_VERSION,
      pnpm: ENGINEERING_RC_PNPM_VERSION,
      exclusions: ENGINEERING_RC_EXCLUSIONS,
      providerIsolation: ENGINEERING_RC_PROVIDER_ISOLATION,
      steps: ENGINEERING_RC_STEPS,
    }, null, 2)}\n`);
    return;
  }
  const result = await runEngineeringRc();
  if (!result.ok) process.exitCode = 1;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await run();
