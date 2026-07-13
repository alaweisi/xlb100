import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const baseCommit = "fb055b1";
const globalConstructionAuthorized = readFileSync(join(root, "docs/CURRENT_STATE.md"), "utf8")
  .includes("Global construction authorization");
let failed = false;

function fail(message) {
  failed = true;
  process.stderr.write(`[phase25-gate1a] FAIL ${message}\n`);
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

const hardcodeMatchers = {
  colorLiteral: /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^\r\n)]*\)/gi,
  dimensionLiteral: /\b(?:0|[1-9]\d*)(?:\.\d+)?(?:px|rem|em|vh|vw)\b/g,
  inlineStyle: /\bstyle\s*=\s*\{\{/g,
  fontDeclaration: /\bfont-(?:family|size|weight|height)\s*:/gi,
  numericZIndex: /\bz-index\s*:\s*-?\d+\b/gi,
};

function countMatches(source, matcher) {
  return [...source.matchAll(new RegExp(matcher.source, matcher.flags))].length;
}

export function collectHardcodeInventory() {
  const inventory = {};
  for (const app of ["customer", "worker", "admin"]) {
    const counts = Object.fromEntries(Object.keys(hardcodeMatchers).map((key) => [key, 0]));
    const files = filesBelow(`apps/${app}/src`).filter((file) =>
      [".css", ".ts", ".tsx"].includes(extname(file)),
    );
    for (const file of files) {
      const source = read(file);
      for (const [category, matcher] of Object.entries(hardcodeMatchers)) {
        counts[category] += countMatches(source, matcher);
      }
    }
    inventory[app] = counts;
  }
  return inventory;
}

if (process.argv.includes("--print-hardcodes")) {
  process.stdout.write(`${JSON.stringify(collectHardcodeInventory(), null, 2)}\n`);
  process.exit(0);
}

const requiredFiles = [
  "packages/ui/src/tokens/base/defaultTokens.ts",
  "packages/ui/src/tokens/themes/themeDefinitions.ts",
  "packages/ui/src/tokens/tokenTypes.ts",
  "packages/types/src/runtimeTheme.ts",
  "packages/validators/src/runtimeThemeSchema.ts",
  "tests/unit/phase25ThemeTokens.test.ts",
  "tests/contract/phase25RuntimeTheme.contract.test.ts",
  "tests/security/phase25Gate1aBoundaries.test.ts",
  "docs/design/ui/phase25/PHASE25_GATE1A_HARDCODE_INVENTORY.md",
  "docs/reports/PHASE25_GATE1A_TOKEN_CONTRACT_REPORT.md",
];
for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) fail(`missing required Gate 1A artifact: ${file}`);
}

const packageManifest = read("package.json");
for (const script of ["test:phase25:gate1a", "gate:phase25:gate1a"]) {
  if (!packageManifest.includes(`\"${script}\"`)) fail(`package script missing ${script}`);
}
if (!read("scripts/preflight-architecture.ps1").includes("check-phase25-gate1a.mjs")) {
  fail("architecture preflight does not execute Gate 1A");
}

const tokenFiles = filesBelow("packages/ui/src/tokens");
const duplicateJsonSources = tokenFiles.filter((file) => file.endsWith(".theme.json"));
if (duplicateJsonSources.length > 0) {
  fail(`theme JSON is a forbidden second source: ${duplicateJsonSources.join(", ")}`);
}

const tokenSource = tokenFiles
  .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .map(read)
  .join("\n");
for (const marker of [
  "CANONICAL_TOKEN_SOURCE",
  "TOKEN_LAYER_TAXONOMY",
  "PROTECTED_THEME_TOKEN_PATHS",
  "ALLOWED_CAMPAIGN_TOKEN_PATHS",
]) {
  if (!tokenSource.includes(marker)) fail(`canonical token source missing ${marker}`);
}
if (!tokenSource.includes("mergeCampaignThemeTokens")) {
  fail("canonical token source is missing the campaign-safe merge entry point");
}

const canonicalValueFiles = new Set([
  "packages/ui/src/tokens/base/defaultTokens.ts",
  "packages/ui/src/tokens/themes/themeDefinitions.ts",
]);
for (const file of tokenFiles.filter((name) => /\.(?:ts|tsx)$/.test(name))) {
  if (canonicalValueFiles.has(file)) continue;
  const source = read(file);
  if (/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^\r\n)]*\)/i.test(source)) {
    fail(`token value literal exists outside the canonical TypeScript sources: ${file}`);
  }
}

if (existsSync(join(root, "packages/types/src/runtimeTheme.ts"))) {
  const contract = read("packages/types/src/runtimeTheme.ts");
  for (const marker of [
    "RUNTIME_CAMPAIGN_TOKEN_PATHS",
    "RuntimeThemeEnvelope",
    "CampaignPresentation",
    "RuntimeThemeAssetManifest",
    "AllowedCampaignTokenOverrides",
  ]) {
    if (!contract.includes(marker)) fail(`runtime theme contract missing ${marker}`);
  }

  const runtimePaths = [
    "campaign.accent", "campaign.ambient",
    "campaign.banner.background", "campaign.banner.text",
    "campaign.badge.background", "campaign.badge.text",
    "campaign.decoration.opacity", "campaign.decoration.intensity",
    "campaign.navigation.accent",
  ];
  for (const path of runtimePaths) {
    if (!contract.includes(`\"${path}\"`) || !tokenSource.includes(`\"${path}\"`)) {
      fail(`runtime/UI campaign token path drift: ${path}`);
    }
  }
  if (!read("packages/types/src/index.ts").includes("./runtimeTheme.js")) {
    fail("@xlb/types does not export the runtime theme contract");
  }
}

if (existsSync(join(root, "packages/validators/src/runtimeThemeSchema.ts"))) {
  const validator = read("packages/validators/src/runtimeThemeSchema.ts");
  for (const marker of [
    "runtimeThemeEnvelopeSchema",
    "campaignPresentationSchema",
    "runtimeThemeAssetManifestSchema",
    "allowedCampaignTokenOverridesSchema",
  ]) {
    if (!validator.includes(marker)) fail(`runtime theme validator missing ${marker}`);
  }
  if (!read("packages/validators/src/index.ts").includes("./runtimeThemeSchema.js")) {
    fail("@xlb/validators does not export the runtime theme schemas");
  }
}

if (existsSync(join(root, "tests/contract/phase25RuntimeTheme.contract.test.ts"))) {
  const contractTest = read("tests/contract/phase25RuntimeTheme.contract.test.ts");
  if (!contractTest.includes("runtimeThemeEnvelopeSchema")) {
    fail("runtime theme contract test does not exercise runtimeThemeEnvelopeSchema");
  }
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
    fail(`Gate 1A forbids runtime/page/backend/database change: ${file}`);
  }
  if (file.startsWith("packages/ui/src/") && !file.startsWith("packages/ui/src/tokens/")) {
    fail(`Gate 1A permits @xlb/ui changes only under tokens/: ${file}`);
  }
  if (file.startsWith("packages/types/src/") &&
      !["packages/types/src/index.ts", "packages/types/src/runtimeTheme.ts"].includes(file)) {
    fail(`Gate 1A permits only the runtime-theme type contract: ${file}`);
  }
  if (file.startsWith("packages/validators/src/") &&
      !["packages/validators/src/index.ts", "packages/validators/src/runtimeThemeSchema.ts"].includes(file)) {
    fail(`Gate 1A permits only the runtime-theme validator contract: ${file}`);
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
if (laterMigrations.length > 0 && !(
  (phase27aAuthorized && laterMigrations.length === 1 &&
    laterMigrations[0] === "db/migrations/054_phase27a_platform_delivery_foundation.sql") ||
  (phase27bB1Authorized &&
    JSON.stringify([...laterMigrations].sort()) === JSON.stringify(phase27bMigrations)) ||
  (phase28Authorized &&
    JSON.stringify([...laterMigrations].sort()) === JSON.stringify(phase28Migrations))
)) {
  fail(`Gate 1A permits migration 054, 055 and 056 only as the exact explicitly authorized chain through Phase28; found ${laterMigrations.join(", ")}`);
}

for (const app of globalConstructionAuthorized ? [] : ["customer", "worker", "admin", "oa", "dashboard"]) {
  for (const file of filesBelow(`apps/${app}/src`).filter((name) => /\.(?:ts|tsx)$/.test(name))) {
    const source = read(file);
    if (/\bThemeProvider\b|\bRuntimeThemeEnvelope\b|\bresolveThemeTokens\b/.test(source)) {
      fail(`Gate 1A forbids App root/runtime theme integration: ${file}`);
    }
  }
}

const inventoryPath = "docs/design/ui/phase25/PHASE25_GATE1A_HARDCODE_INVENTORY.md";
if (existsSync(join(root, inventoryPath))) {
  const inventoryDocument = read(inventoryPath);
  const match = inventoryDocument.match(
    /<!-- PHASE25_HARDCODE_BASELINE_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- PHASE25_HARDCODE_BASELINE_END -->/,
  );
  if (!match) {
    fail("hardcode inventory is missing its machine-readable baseline block");
  } else {
    let baseline;
    try {
      baseline = JSON.parse(match[1]);
    } catch {
      fail("hardcode inventory baseline is not valid JSON");
    }
    if (baseline) {
      const actual = collectHardcodeInventory();
      for (const app of Object.keys(actual)) {
        for (const category of Object.keys(actual[app])) {
          const limit = baseline?.[app]?.[category];
          if (!Number.isInteger(limit) || limit < 0) {
            fail(`hardcode baseline missing non-negative integer ${app}.${category}`);
          } else if (actual[app][category] > limit) {
            fail(`hardcode count increased: ${app}.${category} ${actual[app][category]} > ${limit}`);
          }
        }
      }
    }
  }
}

if (failed) process.exit(1);
process.stdout.write("[phase25-gate1a] PASS canonical tokens, runtime contract, phase boundaries, and no-new-hardcodes baseline verified\n");
