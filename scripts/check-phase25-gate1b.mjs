import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const globalConstructionAuthorized = readFileSync(join(root, "docs/CURRENT_STATE.md"), "utf8")
  .includes("Global construction authorization");
const baseCommit = "fb055b1";
let failed = false;

function fail(message) {
  failed = true;
  process.stderr.write(`[phase25-gate1b] FAIL ${message}\n`);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function filesBelow(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  const result = [];
  for (const name of readdirSync(absolute).sort()) {
    const child = join(absolute, name);
    if (statSync(child).isDirectory()) {
      result.push(...filesBelow(relative(root, child)));
    } else {
      result.push(relative(root, child).replaceAll("\\", "/"));
    }
  }
  return result;
}

const recipeFiles = [
  "packages/ui/src/tokens/recipes/customerMaterialRecipe.ts",
  "packages/ui/src/tokens/recipes/roleMaterialRecipes.ts",
  "packages/ui/src/tokens/recipes/runtimeCapabilityRecipes.ts",
];
const recipeTests = [
  "tests/unit/phase25CustomerMaterialRecipe.test.ts",
  "tests/unit/phase25RoleMaterialRecipes.test.ts",
  "tests/unit/phase25RuntimeCapabilityRecipes.test.ts",
];
const sourceDocuments = [
  "docs/design/ui/phase25/references/customer-apple-liquid-glass-source.png",
  "docs/design/ui/phase25/PHASE25_CUSTOMER_GLASS_MATERIAL_SPEC.md",
  "docs/design/ui/phase25/PHASE25_ROLE_MATERIAL_MATRIX.md",
  "docs/design/figma/source.md",
  "docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png",
  "docs/design/figma/frames/admin/admin_dashboard_default_1-2875.png",
];

const integrationFiles = [
  "docs/reports/PHASE25_GATE1B_MATERIAL_ROLE_RECIPES_REPORT.md",
  "packages/ui/src/tokens/index.ts",
  "package.json",
  "scripts/preflight-architecture.ps1",
  "tests/security/phase25Gate1bBoundaries.test.ts",
];

for (const file of [...recipeFiles, ...recipeTests, ...sourceDocuments, ...integrationFiles]) {
  if (!existsSync(join(root, file))) fail(`missing required Gate 1B artifact: ${file}`);
}

const tokenIndex = read("packages/ui/src/tokens/index.ts");
for (const marker of [
  "customerLiquidGlassMaterialRecipe",
  "roleMaterialRecipes",
  "runtimeCapabilityRecipes",
]) {
  if (!tokenIndex.includes(marker)) fail(`@xlb/ui token index missing ${marker}`);
}
const packageManifest = read("package.json");
for (const script of ["test:phase25:gate1b", "gate:phase25:gate1b"]) {
  if (!packageManifest.includes(`"${script}"`)) fail(`package script missing ${script}`);
}
if (!read("scripts/preflight-architecture.ps1").includes("check-phase25-gate1b.mjs")) {
  fail("architecture preflight does not execute Gate 1B");
}

if (existsSync(join(root, "docs/CURRENT_STATE.md"))) {
  const currentState = read("docs/CURRENT_STATE.md");
  for (const marker of [
    "Phase 25 Gate 1B",
    "Gate 1B authorization",
    "OA/Dashboard current fact",
  ]) {
    if (!currentState.includes(marker)) fail(`CURRENT_STATE missing ${marker}`);
  }
}

const rawColorPattern = /#[0-9a-f]{3,8}\b|(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\s*\(|\b(?:transparent|currentColor)\b/i;
for (const file of recipeFiles) {
  if (!existsSync(join(root, file))) continue;
  if (rawColorPattern.test(read(file))) {
    fail(`recipe must reference canonical tokens instead of raw color values: ${file}`);
  }
}

if (existsSync(join(root, recipeFiles[2]))) {
  const capabilitySource = read(recipeFiles[2]);
  for (const marker of [
    '"no-backdrop-filter"',
    '"forced-colors"',
    '"reduced-motion"',
    '"low-power"',
    "workflow-state-is-authoritative",
    "focus-status-and-dashboard-alert-semantics-remain-protected",
    "Object.freeze",
  ]) {
    if (!capabilitySource.includes(marker)) fail(`capability recipe missing ${marker}`);
  }
}

if (existsSync(join(root, recipeFiles[1]))) {
  const roleSource = read(recipeFiles[1]);
  for (const role of ["worker", "admin", "oa", "dashboard"]) {
    if (!roleSource.includes(`role: "${role}"`)) fail(`role recipe missing ${role}`);
  }
  const oaRecipe = roleSource.match(/role:\s*"oa"[\s\S]{0,1000}?readiness:\s*"blocked"/);
  const dashboardRecipe = roleSource.match(/role:\s*"dashboard"[\s\S]{0,1000}?readiness:\s*"blocked"/);
  if (!oaRecipe) fail("OA recipe must remain readiness blocked");
  if (!dashboardRecipe) fail("Dashboard recipe must remain readiness blocked");
}

const changed = new Set(
  [
    ...execFileSync("git", ["diff", "--name-only", baseCommit], {
      cwd: root,
      encoding: "utf8",
    }).split(/\r?\n/),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    }).split(/\r?\n/),
  ].filter(Boolean).map((file) => file.replaceAll("\\", "/")),
);

const forbiddenChangedPrefixes = [
  "apps/",
  "backend/",
  "db/",
  "deploy/",
  "infra/",
  "packages/api-client/",
];
for (const file of globalConstructionAuthorized ? [] : changed) {
  if (forbiddenChangedPrefixes.some((prefix) => file.startsWith(prefix))) {
    fail(`Gate 1B forbids App/backend/database/API-client change: ${file}`);
  }
  if (file.startsWith("packages/ui/src/") && !file.startsWith("packages/ui/src/tokens/")) {
    fail(`Gate 1B permits @xlb/ui changes only under tokens/: ${file}`);
  }
}

const laterMigrations = filesBelow("db/migrations").filter((file) => {
  const match = /\/(\d{3})[_-].*\.sql$/i.exec(`/${file}`);
  return match && Number(match[1]) >= 54;
});
const currentState = read("docs/CURRENT_STATE.md");
const phase27aAuthorized =
  currentState.includes("Phase 27A | IN PROGRESS — RUNTIME ENTRY AUTHORIZED") ||
  currentState.includes("Phase 27A | HUMAN ACCEPTED — NOT LOCKED");
const phase27bB1Authorized =
  currentState.includes("Phase 27B | B1 IMPLEMENTED") ||
  currentState.includes("Phase 27B | B1 ACCEPTED") ||
  currentState.includes("Phase 27B | B2 IMPLEMENTED") ||
  currentState.includes("Phase 27B | B2/C/D ACCEPTED") ||
  currentState.includes("Phase 27 | LOCKED");
const phase27bMigrations = [
  "db/migrations/054_phase27a_platform_delivery_foundation.sql",
  "db/migrations/055_phase27b_notification_projection_foundation.sql",
];
const phase28DecisionPath = "docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md";
const phase28Authorized =
  currentState.includes("Phase 27 | LOCKED") &&
  existsSync(join(root, phase28DecisionPath)) &&
  read(phase28DecisionPath).includes("HUMAN APPROVED") &&
  existsSync(join(root, "db/migrations/056_phase28_review_reputation.sql"));
const phase28Migrations = [
  ...phase27bMigrations,
  "db/migrations/056_phase28_review_reputation.sql",
];
const phase29EntryPath = "docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md";
const phase29ArchitecturePath = "docs/architecture/29_XLB_MARKETING_COUPON.md";
const phase29ContractPath = "docs/contracts/CONTRACT_MARKETING_COUPON.md";
const phase29RegistryPath = "docs/governance/phase-registry.json";
const phase29MigrationPath = "db/migrations/057_phase29_marketing_coupon.sql";
const phase29Authorized =
  phase28Authorized &&
  (currentState.includes("Phase 29 — Marketing / Coupon MVP (IN PROGRESS)") ||
    currentState.includes("Phase 29 — Marketing / Coupon MVP (LOCKED)")) &&
  currentState.includes("approved Entry decisions D01–D24") &&
  currentState.includes("migration `057` only") &&
  existsSync(join(root, phase29EntryPath)) &&
  read(phase29EntryPath).includes("Every row below is **HUMAN APPROVED**") &&
  read(phase29EntryPath).includes("| D24 |") &&
  existsSync(join(root, phase29ArchitecturePath)) &&
  read(phase29ArchitecturePath).includes("ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED") &&
  existsSync(join(root, phase29ContractPath)) &&
  read(phase29ContractPath).includes("Phase 29 human-approved contract") &&
  existsSync(join(root, phase29RegistryPath)) &&
  read(phase29RegistryPath).includes("Entry decisions D01-D24 are approved for continuous construction through independent acceptance.") &&
  existsSync(join(root, phase29MigrationPath));
const phase29Migrations = [
  ...phase28Migrations,
  phase29MigrationPath,
];
const postPhase29Migrations = laterMigrations.slice(phase29Migrations.length);
const phase29AndPostLockMigrationsAuthorized =
  phase29Authorized &&
  JSON.stringify(laterMigrations.slice(0, phase29Migrations.length)) ===
    JSON.stringify(phase29Migrations) &&
  postPhase29Migrations.every((file, index) => {
    const match = /^db\/migrations\/(\d{3})_[^/]+\.sql$/i.exec(file);
    if (!match || Number(match[1]) <= 57) return false;
    if (index === 0) return true;
    const previous = /\/(\d{3})_/.exec(postPhase29Migrations[index - 1]);
    return Boolean(previous) && Number(match[1]) > Number(previous[1]);
  });
if (laterMigrations.length > 0 && !(
  (phase27aAuthorized && laterMigrations.length === 1 &&
    laterMigrations[0] === "db/migrations/054_phase27a_platform_delivery_foundation.sql") ||
  (phase27bB1Authorized &&
    JSON.stringify([...laterMigrations].sort()) === JSON.stringify(phase27bMigrations)) ||
  (phase28Authorized &&
    JSON.stringify([...laterMigrations].sort()) === JSON.stringify(phase28Migrations)) ||
  (phase29Authorized &&
    JSON.stringify([...laterMigrations].sort()) === JSON.stringify(phase29Migrations)) ||
  phase29AndPostLockMigrationsAuthorized
)) {
  fail(`Gate 1B migration 054+ boundary requires the locked Phase 27-29 chain followed only by canonical append-only migrations; found ${laterMigrations.join(", ")}`);
}

for (const [tag, migration] of [
  ["xlb-phase27-notification-foundation^{}", phase27bMigrations[0]],
  ["xlb-phase27-notification-foundation^{}", phase27bMigrations[1]],
  ["xlb-phase28-review-reputation^{}", phase28Migrations[2]],
]) {
  const workingHash = execFileSync("git", ["hash-object", migration], { cwd: root, encoding: "utf8" }).trim();
  const lockedHash = execFileSync("git", ["rev-parse", `${tag}:${migration}`], { cwd: root, encoding: "utf8" }).trim();
  if (workingHash !== lockedHash) fail(`locked migration hash differs from ${tag}: ${migration}`);
}

for (const app of globalConstructionAuthorized ? [] : ["customer", "worker", "admin", "oa", "dashboard"]) {
  for (const file of filesBelow(`apps/${app}/src`).filter((name) => /\.(?:ts|tsx)$/.test(name))) {
    const source = read(file);
    if (/\bThemeProvider\b|\bRuntimeThemeEnvelope\b|\bresolveThemeTokens\b/.test(source)) {
      fail(`Gate 1B forbids Gate 1C ThemeProvider/App integration: ${file}`);
    }
  }
}

if (failed) process.exit(1);
process.stdout.write("[phase25-gate1b] PASS source-grounded role/material recipes, capability fallbacks, readiness blocks, and phase boundaries verified\n");
