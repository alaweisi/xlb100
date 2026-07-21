import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "docs/architecture/25_XLB_FIVE_SYSTEM_UI_STANDARDIZATION.md",
  "docs/execution/PHASE25_UI_STANDARDIZATION_EXECUTION_CONTROL.md",
  "docs/reports/PHASE25_UI_STANDARDIZATION_ENTRY_REPORT.md",
  "docs/reports/PHASE25_MULTI_AGENT_UI_SYSTEM_AUDIT.md",
  "docs/reports/PHASE25_GATE1A_TOKEN_CONTRACT_REPORT.md",
  "docs/reports/PHASE25_GATE1B_MATERIAL_ROLE_RECIPES_REPORT.md",
  "docs/design/ui/phase25/PHASE25_ROUTE_CONTRACT_MATRIX.md",
  "docs/design/ui/phase25/PHASE25_CAMPAIGN_THEME_EVOLUTION.md",
  "docs/design/ui/phase25/PHASE25_DESIGN_TOKEN_RUNTIME_THEMING_STANDARD.md",
  "docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md",
  "docs/design/ui/XLB_CUSTOMER_APP_DESIGN_SYSTEM.md",
  "docs/design/ui/CUSTOMER_FULL_BUSINESS_SLICE_VISUAL_REFACTOR_SCOPE.md",
  "docs/design/ui/CUSTOMER_UI_REFACTOR_ENGINEERING_TOPOLOGY.md",
  "docs/design/ui/CUSTOMER_UI_REFACTOR_P0_BASELINE.md",
  "docs/design/ui/references/customer-home-visual-truth.png",
];

function fail(message) {
  process.stderr.write(`[phase25-ui-design] FAIL ${message}\n`);
  process.exitCode = 1;
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) fail(`missing ${file}`);
}

const customerHomeVisual = "docs/design/ui/references/customer-home-visual-truth.png";
const customerHomeVisualHash = "32cb6d243e8c7dd1b662110ebf2d9cfc79fe568ea23611097a4e4b2d6e3af74c";
if (existsSync(join(root, customerHomeVisual))) {
  const actualHash = createHash("sha256").update(readFileSync(join(root, customerHomeVisual))).digest("hex");
  if (actualHash !== customerHomeVisualHash) fail(`Customer Home visual truth hash changed: ${actualHash}`);
}
for (const retiredSource of [
  "docs/design/ui/phase25/references/customer-apple-liquid-glass-source.png",
  "docs/design/figma/frames/customer/customer_home_default_1-228.png",
]) {
  if (existsSync(join(root, retiredSource))) fail(`retired Customer Home source must stay deleted: ${retiredSource}`);
}

const currentCustomerHomeImages = readdirSync(join(root, "docs/design/ui/references"))
  .filter((name) => /customer.*home|home.*customer|liquid.*glass/i.test(name));
if (currentCustomerHomeImages.length !== 1 || currentCustomerHomeImages[0] !== "customer-home-visual-truth.png") {
  fail(`Customer Home must have exactly one current image: ${currentCustomerHomeImages.join(", ")}`);
}

const currentState = readFileSync(join(root, "docs/CURRENT_STATE.md"), "utf8");
const phase25Locked = /Phase 25\s*\|\s*LOCKED/.test(currentState);
if (!phase25Locked) fail("CURRENT_STATE does not record Phase 25 LOCKED");
if (!/Customer UI full-slice refactor P0\s*\|\s*BASELINE FROZEN — READY FOR P1/.test(currentState)) {
  fail("CURRENT_STATE does not record the frozen Customer UI P0 baseline");
}
if (!currentState.includes("Gate 1A acceptance") || !currentState.includes("Phase 25 Gate 1B")) {
  fail("CURRENT_STATE does not record Gate 1A acceptance and Gate 1B entry");
}

const architecture = readFileSync(join(root, requiredFiles[0]), "utf8");
for (const marker of ["Customer 主页材料语言", "Gate 0", "Gate 8", "Customer", "Worker", "Admin", "OA", "Dashboard", "Readiness"]) {
  if (!architecture.includes(marker)) fail(`architecture missing marker ${marker}`);
}

const campaignEvolution = readFileSync(
  join(root, "docs/design/ui/phase25/PHASE25_CAMPAIGN_THEME_EVOLUTION.md"),
  "utf8",
);
for (const marker of ["后端活动/定价算法", "Campaign Contract Bridge", "Asset Slots", "OA/Dashboard scope", "前端禁止"]) {
  if (!campaignEvolution.includes(marker)) fail(`campaign evolution missing marker ${marker}`);
}

const runtimeTheming = readFileSync(
  join(root, "docs/design/ui/phase25/PHASE25_DESIGN_TOKEN_RUNTIME_THEMING_STANDARD.md"),
  "utf8",
);
for (const marker of ["Design Token-driven Runtime Theming", "L0 Foundation", "Runtime Theme Envelope", "确定性解析算法", "发布、预览与回滚", "Gate 1F 验收矩阵"]) {
  if (!runtimeTheming.includes(marker)) fail(`runtime theming standard missing marker ${marker}`);
}

const systemAudit = readFileSync(
  join(root, "docs/reports/PHASE25_MULTI_AGENT_UI_SYSTEM_AUDIT.md"),
  "utf8",
);
for (const marker of ["ThemeProvider` 全仓尚未", "WorkflowUiBinding", "Gate 6A/7A", "Gate 1A–1F 强制产物", "八类硬测试矩阵"]) {
  if (!systemAudit.includes(marker)) fail(`multi-agent audit missing marker ${marker}`);
}

// The historical Gate 1A delta boundary applies only while Phase 25 is open.
// Once Phase 25 is locked, later locked phases legitimately add application,
// backend, test and migration files; scanning them against fb055b1 would report
// false scope violations and can no longer be used as a current design gate.
if (!phase25Locked) {
  const changed = new Set([
    ...execFileSync("git", ["diff", "--name-only", "fb055b1"], { cwd: root, encoding: "utf8" }).split(/\r?\n/),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split(/\r?\n/),
  ].filter(Boolean));

  const allowedExact = new Set([
    "package.json",
    "scripts/preflight-architecture.ps1",
    "scripts/check-phase24-completion-boundaries.ps1",
    "scripts/check-phase25-ui-design-gate.mjs",
    "scripts/check-phase25-gate1a.mjs",
    "scripts/check-phase25-gate1b.mjs",
    "scripts/check-phase25-gate1c.mjs",
    "packages/types/src/runtimeTheme.ts",
    "packages/types/src/index.ts",
    "packages/validators/src/runtimeThemeSchema.ts",
    "packages/validators/src/index.ts",
    "tests/contract/phase25RuntimeTheme.contract.test.ts",
    "tests/unit/phase25ThemeTokens.test.ts",
    "tests/security/phase25Gate1aBoundaries.test.ts",
    "tests/unit/phase25CustomerMaterialRecipe.test.ts",
    "tests/unit/phase25RoleMaterialRecipes.test.ts",
    "tests/unit/phase25RuntimeCapabilityRecipes.test.ts",
    "tests/security/phase25Gate1bBoundaries.test.ts",
    "tests/unit/phase25RuntimeThemeResolver.test.ts",
  ]);
  for (const file of changed) {
    if (file.startsWith("docs/") || file.startsWith("packages/ui/src/tokens/") || allowedExact.has(file)) continue;
    fail(`Gate 1A forbids out-of-scope construction file: ${file}`);
  }

  const migrations = readdirSync(join(root, "db/migrations"));
  if (migrations.some(name => /^054[_-].*\.sql$/i.test(name))) fail("Phase 25 UI scope forbids migration 054");
}

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("[phase25-ui-design] PASS locked Phase 25 sources and Customer P0 visual authority verified\n");
