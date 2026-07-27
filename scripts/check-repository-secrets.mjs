import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SECRET_PATTERNS = Object.freeze([
  {
    id: "private-key",
    expression: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/u,
  },
  {
    id: "aws-access-key",
    expression: /\bAKIA[0-9A-Z]{16}\b/u,
  },
  {
    id: "tencent-secret-id",
    expression: /\bAKID[0-9A-Za-z]{20,}\b/u,
  },
  {
    id: "google-api-key",
    expression: /\bAIza[0-9A-Za-z_-]{30,}\b/u,
  },
  {
    id: "openai-api-key",
    expression: /\bsk-(?:proj-)?[0-9A-Za-z_-]{24,}\b/u,
  },
  {
    id: "github-token",
    expression: /\b(?:gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{40,})\b/u,
  },
  {
    id: "slack-token",
    expression: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u,
  },
  {
    id: "stripe-live-secret",
    expression: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/u,
  },
  {
    id: "twilio-api-key",
    expression: /\bSK[0-9a-fA-F]{32}\b/u,
  },
  {
    id: "jwt",
    expression: /\beyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/u,
  },
  {
    id: "generic-high-entropy-secret",
    expression: /\b(?:api[_-]?key|secret|token|password|passwd|private[_-]?key)\b["']?\s*[:=]\s*["']?([0-9A-Za-z_+/=-]{24,})/iu,
    allowPlaceholder: true,
  },
]);

const sensitivePathExpression = /\.(?:jks|keystore|p12|pfx|key)$/iu;
const allowedEnvironmentExamples = new Set([
  ".env.example",
  ".env.production.example",
  ".env.staging.example",
]);

function normalizedPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function lineFindings(filePath, line, lineNumber) {
  const findings = [];
  for (const rule of SECRET_PATTERNS) {
    const match = line.match(rule.expression);
    if (!match) continue;
    if (rule.allowPlaceholder) {
      const candidate = match[1] ?? match[0];
      const characterClasses = [
        /[a-z]/u,
        /[A-Z]/u,
        /[0-9]/u,
        /[^A-Za-z0-9]/u,
      ].filter((expression) => expression.test(candidate)).length;
      if (
        characterClasses < 3
        || new Set(candidate).size < 12
        || shannonEntropy(candidate) < 3.9
      ) {
        continue;
      }
    }
    if (
      rule.allowPlaceholder
      && /(?:capture|change|dryrun|example|fake|fixture|invalid|local|placeholder|replace|simulation|smoke|test)/iu.test(
        match[1] ?? match[0],
      )
    ) {
      continue;
    }
    findings.push({ path: filePath, line: lineNumber, rule: rule.id });
  }
  return findings;
}

export function scanTrackedEntries(entries) {
  const findings = [];
  for (const entry of entries) {
    const filePath = normalizedPath(entry.path);
    if (filePath === "audit_report.md") continue;
    if (sensitivePathExpression.test(filePath)) {
      findings.push({ path: filePath, line: 1, rule: "tracked-sensitive-file" });
    }
    const baseName = path.posix.basename(filePath);
    if (
      (baseName === ".env" || baseName.startsWith(".env."))
      && !allowedEnvironmentExamples.has(filePath)
      && !filePath.endsWith(".example")
    ) {
      findings.push({ path: filePath, line: 1, rule: "tracked-environment-file" });
    }
    if (entry.binary || typeof entry.content !== "string") continue;
    const lines = entry.content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      findings.push(...lineFindings(filePath, lines[index], index + 1));
    }
  }
  return findings;
}

function trackedFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("git ls-files failed");
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

export function scanRepository(root = rootDir) {
  const entries = trackedFiles(root).map((filePath) => {
    const absolute = path.resolve(root, filePath);
    const bytes = fs.readFileSync(absolute);
    const binary = bytes.includes(0);
    return {
      path: filePath,
      binary,
      content: binary ? undefined : bytes.toString("utf8"),
    };
  });
  return scanTrackedEntries(entries);
}

function patchScanner() {
  const findings = [];
  const seen = new Set();
  let currentCommit = "";
  let currentPath = "";
  let currentLine = 0;
  return {
    process(line) {
      if (line.startsWith("commit ")) {
        currentCommit = line.slice("commit ".length).trim();
        return;
      }
      if (line.startsWith("+++ ")) {
        const raw = line.slice(4).trim();
        currentPath = raw === "/dev/null"
          ? ""
          : normalizedPath(raw.replace(/^"?b\//u, "").replace(/"$/u, ""));
        return;
      }
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
      if (hunk) {
        currentLine = Number(hunk[1]);
        return;
      }
      if (!currentPath || currentPath === "audit_report.md") return;
      if (line.startsWith("+") && !line.startsWith("+++")) {
        for (const finding of lineFindings(
          currentPath,
          line.slice(1),
          currentLine,
        )) {
          const key = `${currentPath}:${finding.rule}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({ ...finding, commit: currentCommit });
        }
        currentLine += 1;
      } else if (!line.startsWith("-")) {
        currentLine += 1;
      }
    },
    findings,
  };
}

export function scanGitPatchText(patchText) {
  const scanner = patchScanner();
  for (const line of patchText.split(/\r?\n/u)) scanner.process(line);
  return scanner.findings;
}

export function scanGitHistory(root = rootDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      [
        "log",
        "--all",
        "--format=commit %H",
        "--patch",
        "--unified=0",
        "--no-ext-diff",
        "--no-textconv",
        "--",
        ".",
        ":(exclude)audit_report.md",
      ],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const scanner = patchScanner();
    let buffered = "";
    let standardError = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/u);
      buffered = lines.pop() ?? "";
      for (const line of lines) scanner.process(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (standardError.length < 8_192) standardError += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (buffered) scanner.process(buffered);
      if (signal || code !== 0) {
        reject(
          new Error(
            `git history secret scan failed${signal ? ` by ${signal}` : ` with exit code ${code}`}: ${standardError.trim()}`,
          ),
        );
        return;
      }
      resolve(scanner.findings);
    });
  });
}

async function run() {
  const findings = [
    ...scanRepository(),
    ...await scanGitHistory(),
  ];
  if (findings.length > 0) {
    for (const finding of findings) {
      const commit = finding.commit ? ` commit=${finding.commit}` : "";
      process.stderr.write(
        `[secrets] FAIL ${finding.path}:${finding.line} rule=${finding.rule}${commit}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    "[secrets] PASS current tree and full Git history contain no recognized private keys, API tokens, or high-entropy assigned secrets\n",
  );
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await run();
