import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const severityOrder = new Map([
  ["low", 0],
  ["moderate", 1],
  ["high", 2],
  ["critical", 3],
]);

export function collectDependencyVersions(projects) {
  const versionsByName = new Map();

  function visitDependencies(dependencies) {
    if (!dependencies || typeof dependencies !== "object") return;

    for (const [dependencyName, dependency] of Object.entries(dependencies)) {
      if (!dependency || typeof dependency !== "object") continue;
      const name = typeof dependency.name === "string" ? dependency.name : dependencyName;
      const version = typeof dependency.version === "string" ? dependency.version : undefined;
      if (name && version && !version.startsWith("link:") && !version.startsWith("workspace:")) {
        const versions = versionsByName.get(name) ?? new Set();
        versions.add(version);
        versionsByName.set(name, versions);
      }

      visitDependencies(dependency.dependencies);
      visitDependencies(dependency.devDependencies);
      visitDependencies(dependency.optionalDependencies);
    }
  }

  for (const project of projects) {
    visitDependencies(project.dependencies);
    visitDependencies(project.devDependencies);
    visitDependencies(project.optionalDependencies);
  }

  return versionsByName;
}

export function buildBulkPayload(versionsByName) {
  return Object.fromEntries(
    [...versionsByName.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [name, [...versions].sort()]),
  );
}

export function advisoriesAtOrAbove(response, auditLevel) {
  const threshold = severityOrder.get(auditLevel);
  if (threshold === undefined) throw new Error(`Unsupported audit level: ${auditLevel}`);

  const findings = new Map();
  for (const [packageName, advisories] of Object.entries(response)) {
    if (!Array.isArray(advisories)) continue;
    for (const advisory of advisories) {
      const severity = String(advisory.severity ?? "").toLowerCase();
      const rank = severityOrder.get(severity);
      if (rank === undefined || rank < threshold) continue;
      const id = advisory.id ?? advisory.url ?? `${packageName}:${advisory.title ?? advisory.range ?? severity}`;
      findings.set(String(id), { packageName, ...advisory, severity });
    }
  }
  return [...findings.values()];
}

export function bulkAdvisoryUrl(registry) {
  const normalized = registry.endsWith("/") ? registry : `${registry}/`;
  return new URL("-/npm/v1/security/advisories/bulk", normalized).toString();
}

function parseAuditLevel(args) {
  const index = args.indexOf("--audit-level");
  return index >= 0 ? args[index + 1] : "critical";
}

function installedProjects() {
  const listArgs = ["list", "--recursive", "--json", "--depth", "Infinity"];
  const command = process.env.npm_execpath ? process.execPath : "pnpm";
  const args = process.env.npm_execpath ? [process.env.npm_execpath, ...listArgs] : listArgs;
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm list failed (${result.status}): ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

async function run() {
  const auditLevel = parseAuditLevel(process.argv.slice(2));
  if (!severityOrder.has(auditLevel)) {
    throw new Error(`--audit-level must be one of: ${[...severityOrder.keys()].join(", ")}`);
  }

  const versionsByName = collectDependencyVersions(installedProjects());
  if (versionsByName.size === 0) {
    throw new Error("No installed dependency versions found. Run pnpm install --frozen-lockfile first.");
  }

  const registry = process.env.XLB_AUDIT_REGISTRY ?? "https://registry.npmjs.org/";
  const endpoint = bulkAdvisoryUrl(registry);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "xlb-ci-supply-audit/1",
    },
    body: JSON.stringify(buildBulkPayload(versionsByName)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Bulk Advisory endpoint returned ${response.status} ${response.statusText}`);
  }

  const advisories = advisoriesAtOrAbove(await response.json(), auditLevel);
  if (advisories.length > 0) {
    console.error(`dependency-audit: ${advisories.length} ${auditLevel}+ advisories found`);
    for (const advisory of advisories) {
      console.error(
        `- ${advisory.packageName}: ${advisory.severity} ${advisory.title ?? advisory.url ?? advisory.id}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const versionCount = [...versionsByName.values()].reduce((total, versions) => total + versions.size, 0);
  console.log(
    `dependency-audit: passed (${versionsByName.size} packages / ${versionCount} installed versions, no ${auditLevel}+ advisories)`,
  );
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  run().catch(error => {
    console.error(`dependency-audit: failed: ${error.message}`);
    process.exitCode = 2;
  });
}
