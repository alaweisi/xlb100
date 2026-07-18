import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const EXPECTED = Object.freeze({
  slices: 214,
  terminals: Object.freeze({ customer: 62, worker: 54, admin: 98 }),
  carriers: 36,
  frames: Object.freeze({ base: 36, gate: 7, state: 61, total: 104 }),
});

export const STATUS_ORDER = Object.freeze([
  "DEFINED",
  "READY",
  "IMPLEMENTED",
  "API_INTEGRATED",
  "TESTED",
  "EDGE_VERIFIED",
  "ACCEPTED",
]);

const terminalByPrefix = Object.freeze({ C: "customer", W: "worker", A: "admin" });
const expressionNames = Object.freeze({ G: "GATE", SF: "STATE_FRAME", R: "REGION", O: "OVERLAY" });
const uiPropertyNames = new Set([
  "label",
  "title",
  "subtitle",
  "description",
  "placeholder",
  "recoveryTarget",
  "emptyLabel",
  "emptyText",
  "helperText",
  "notice",
  "message",
  "error",
  "successText",
]);
const uiAttributeNames = new Set([...uiPropertyNames, "aria-label"]);

function stripTicks(value) {
  return value.trim().replace(/^`|`$/g, "");
}

export function batchForCarrier(carrierId) {
  const [prefix, rawNumber] = carrierId.split("-");
  const number = Number(rawNumber);
  if (number === 0) return "B0";
  if (
    (prefix === "C" && number >= 1 && number <= 4) ||
    (prefix === "W" && number >= 1 && number <= 3) ||
    (prefix === "A" && [5, 9, 10].includes(number))
  ) return "B1";
  if (
    (prefix === "C" && number === 5) ||
    (prefix === "W" && number === 4) ||
    (prefix === "A" && number === 7)
  ) return "B2";
  if (
    (prefix === "C" && [6, 7].includes(number)) ||
    (prefix === "W" && number >= 6 && number <= 8) ||
    (prefix === "A" && number >= 11 && number <= 13)
  ) return "B3";
  if (
    (prefix === "C" && number === 9) ||
    (prefix === "W" && [5, 9, 10].includes(number)) ||
    (prefix === "A" && ([1, 2, 3, 4, 6].includes(number)))
  ) return "B4";
  if (
    (prefix === "C" && number === 8) ||
    (prefix === "A" && [8, 14].includes(number))
  ) return "B5";
  throw new Error(`没有为 Carrier ${carrierId} 配置施工批次`);
}

export function parseCarrierSurfaces(scopeMarkdown) {
  const surfaces = new Map();
  for (const line of scopeMarkdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const carrierId = stripTicks(cells[1] ?? "");
    if (!/^[CWA]-\d{2}$/.test(carrierId)) continue;
    surfaces.set(carrierId, stripTicks(cells[2] ?? ""));
  }
  return surfaces;
}

export function parseBindings(bindingMarkdown, scopeMarkdown) {
  const surfaces = parseCarrierSurfaces(scopeMarkdown);
  const carriers = [];
  const slices = [];
  let current = null;

  for (const line of bindingMarkdown.split(/\r?\n/)) {
    const heading = line.match(/^### `([CWA]-\d{2})`\s+(.+)$/);
    if (heading) {
      current = {
        carrierId: heading[1],
        name: heading[2].trim(),
        terminal: terminalByPrefix[heading[1][0]],
        surface: surfaces.get(heading[1]) ?? "",
        batch: batchForCarrier(heading[1]),
        designPath: "",
      };
      carriers.push(current);
      continue;
    }
    if (!current) continue;
    const designPath = line.match(/^路径：`(.+)`$/);
    if (designPath) {
      current.designPath = designPath[1];
      continue;
    }
    const binding = line.match(/^- `(G|SF|R|O)`：(.+)$/);
    if (!binding) continue;
    for (const match of binding[2].matchAll(/`([CWA]\.[A-Z0-9_.]+)`/g)) {
      slices.push({
        sliceId: match[1],
        terminal: current.terminal,
        carrierId: current.carrierId,
        carrierName: current.name,
        surface: current.surface,
        batch: current.batch,
        expression: expressionNames[binding[1]],
        designPath: current.designPath,
      });
    }
  }
  return { carriers, slices };
}

function newCarrier(carrier) {
  return {
    ...carrier,
    baseFrame: {
      status: "DEFINED",
      implementationRoute: "",
      sourceFiles: [],
      edgeEvidence: [],
      notes: "",
    },
  };
}

function newSlice(slice) {
  return {
    ...slice,
    status: "DEFINED",
    localization: { status: "PENDING", exceptions: [] },
    implementation: {
      route: "",
      sourceFiles: [],
      component: "",
      apiBindings: [],
    },
    business: {
      authoritativeStates: [],
      permissions: [],
      entryCondition: "",
      persistedResult: "",
      recovery: "",
      handoff: "",
      scenarioKind: "",
    },
    tests: [],
    edgeEvidence: [],
    acceptance: { acceptedBy: "", acceptedAt: "", notes: "" },
  };
}

export function syncLedger(parsed, existing = null) {
  const oldCarriers = new Map((existing?.carriers ?? []).map((item) => [item.carrierId, item]));
  const oldSlices = new Map((existing?.slices ?? []).map((item) => [item.sliceId, item]));
  return {
    schemaVersion: 1,
    sourceVersion: "XLB-SCOPE-V1",
    generatedFrom: {
      scope: "docs/design/ui/vertical-slices/SLICE_SCOPE_BASELINE.md",
      bindings: "docs/design/ui/vertical-slices/FRAME_MAP_SLICE_BINDINGS.md",
    },
    framePlan: EXPECTED.frames,
    carriers: parsed.carriers.map((carrier) => ({
      ...newCarrier(carrier),
      ...(oldCarriers.get(carrier.carrierId) ?? {}),
      ...carrier,
    })),
    slices: parsed.slices.map((slice) => ({
      ...newSlice(slice),
      ...(oldSlices.get(slice.sliceId) ?? {}),
      ...slice,
    })),
  };
}

export function validateStructure(ledger, parsed) {
  const errors = [];
  const ledgerIds = ledger.slices.map((item) => item.sliceId);
  const bindingIds = parsed.slices.map((item) => item.sliceId);
  const duplicateIds = ledgerIds.filter((id, index) => ledgerIds.indexOf(id) !== index);
  if (ledgerIds.length !== EXPECTED.slices) errors.push(`总账切片数应为 ${EXPECTED.slices}，实际为 ${ledgerIds.length}`);
  if (ledger.carriers.length !== EXPECTED.carriers) errors.push(`Carrier 数应为 ${EXPECTED.carriers}，实际为 ${ledger.carriers.length}`);
  if (duplicateIds.length) errors.push(`总账存在重复 Slice ID：${[...new Set(duplicateIds)].join("、")}`);
  const missing = bindingIds.filter((id) => !ledgerIds.includes(id));
  const extra = ledgerIds.filter((id) => !bindingIds.includes(id));
  if (missing.length) errors.push(`总账遗漏：${missing.join("、")}`);
  if (extra.length) errors.push(`总账多出：${extra.join("、")}`);
  for (const [terminal, expected] of Object.entries(EXPECTED.terminals)) {
    const actual = ledger.slices.filter((item) => item.terminal === terminal).length;
    if (actual !== expected) errors.push(`${terminal} 切片数应为 ${expected}，实际为 ${actual}`);
  }
  for (const item of ledger.slices) {
    if (!STATUS_ORDER.includes(item.status)) errors.push(`${item.sliceId} 使用了非法状态 ${item.status}`);
    if (item.status === "ACCEPTED" && (!item.acceptance?.acceptedBy || !item.acceptance?.acceptedAt)) {
      errors.push(`${item.sliceId} 已标记 ACCEPTED，但缺少验收人或验收时间`);
    }
  }
  return errors;
}

function reached(status, target) {
  return STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf(target);
}

export function validateProgression(rootDir, ledger) {
  const errors = [];
  for (const item of ledger.slices) {
    const implementation = item.implementation ?? {};
    const business = item.business ?? {};
    if (reached(item.status, "READY")) {
      if (!(business.authoritativeStates?.length)) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少后端权威状态`);
      if (!(business.permissions?.length)) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少权限范围`);
      if (!business.entryCondition) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少进入条件`);
      if (!["staging-seed", "contract-state"].includes(business.scenarioKind)) errors.push(`${item.sliceId} 已到 ${item.status}，但场景类型无效`);
    }
    if (reached(item.status, "IMPLEMENTED")) {
      if (!implementation.route) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少真实路由`);
      if (!refsExist(rootDir, implementation.sourceFiles ?? [])) errors.push(`${item.sliceId} 已到 ${item.status}，但源文件不存在`);
    }
    if (reached(item.status, "API_INTEGRATED")) {
      if (!(implementation.apiBindings?.length)) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少 API binding`);
      if (!business.persistedResult) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少持久结果`);
      if (!business.recovery) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少异常恢复`);
      if (!business.handoff) errors.push(`${item.sliceId} 已到 ${item.status}，但缺少跨端交接`);
    }
    if (reached(item.status, "TESTED") && !refsExist(rootDir, item.tests ?? [])) {
      errors.push(`${item.sliceId} 已到 ${item.status}，但测试文件不存在`);
    }
    if (reached(item.status, "EDGE_VERIFIED") && !isEvidenceReady(rootDir, item)) {
      errors.push(`${item.sliceId} 已到 ${item.status}，但 Edge 真实画面证据不完整`);
    }
    if (item.status === "ACCEPTED") {
      if (item.localization?.status !== "COMPLETE") errors.push(`${item.sliceId} 已验收，但中文状态未完成`);
      if (!item.acceptance?.acceptedBy || !item.acceptance?.acceptedAt) errors.push(`${item.sliceId} 已验收，但验收记录不完整`);
    }
  }
  for (const carrier of ledger.carriers) {
    const base = carrier.baseFrame ?? {};
    if (!STATUS_ORDER.includes(base.status)) errors.push(`${carrier.carrierId} Base Frame 状态无效：${base.status}`);
    if (base.status === "ACCEPTED") {
      if (!base.implementationRoute) errors.push(`${carrier.carrierId} Base Frame 已验收，但缺少真实路由`);
      if (!refsExist(rootDir, base.sourceFiles ?? [])) errors.push(`${carrier.carrierId} Base Frame 已验收，但源文件不存在`);
      if (!isEvidenceReady(rootDir, { edgeEvidence: base.edgeEvidence ?? [] })) errors.push(`${carrier.carrierId} Base Frame 已验收，但 Edge 证据不完整`);
    }
  }
  return errors;
}

function walkFiles(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["dist", "node_modules", "coverage"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(target));
    else if (entry.isFile() && target.endsWith(".tsx")) output.push(target);
  }
  return output;
}

function propertyName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node)) return node.text;
  return "";
}

function nearestUiProperty(node) {
  let current = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current)) return uiPropertyNames.has(propertyName(current.name));
    if (ts.isJsxAttribute(current)) return uiAttributeNames.has(current.name.text);
    if (ts.isImportDeclaration(current) || ts.isCallExpression(current) || ts.isVariableStatement(current)) break;
    current = current.parent;
  }
  return false;
}

function isJsxChildExpression(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) return false;
    if (ts.isJsxExpression(current)) return Boolean(current.parent && (ts.isJsxElement(current.parent) || ts.isJsxFragment(current.parent)));
    if (ts.isPropertyAssignment(current) || ts.isCallExpression(current)) return false;
    current = current.parent;
  }
  return false;
}

function normalizeVisibleText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function hasUntranslatedAscii(value, allowedTokens) {
  let remaining = value;
  for (const token of allowedTokens) {
    remaining = remaining.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
  }
  return /[A-Za-z]/.test(remaining);
}

export function scanVisibleLanguage(rootDir, allowlist) {
  const violations = [];
  const allowedTokens = allowlist.allowedTechnicalTokens ?? [];
  for (const app of ["customer", "worker", "admin"]) {
    const sourceRoot = path.join(rootDir, "apps", app, "src");
    for (const file of walkFiles(sourceRoot)) {
      const sourceText = fs.readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const seen = new Set();
      const record = (node, raw) => {
        const text = normalizeVisibleText(raw);
        if (!text || !hasUntranslatedAscii(text, allowedTokens)) return;
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const key = `${position.line + 1}:${text}`;
        if (seen.has(key)) return;
        seen.add(key);
        violations.push({
          terminal: app,
          file: path.relative(rootDir, file).replaceAll("\\", "/"),
          line: position.line + 1,
          text,
        });
      };
      const visit = (node) => {
        if (ts.isJsxText(node)) record(node, node.getText(sourceFile));
        else if (ts.isStringLiteralLike(node) && (nearestUiProperty(node) || isJsxChildExpression(node))) record(node, node.text);
        else if (ts.isNoSubstitutionTemplateLiteral(node) && (nearestUiProperty(node) || isJsxChildExpression(node))) record(node, node.text);
        else if (ts.isTemplateExpression(node) && (nearestUiProperty(node) || isJsxChildExpression(node))) {
          const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
          record(node, text);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return violations;
}

function refsExist(rootDir, refs, key = "file") {
  return refs.length > 0 && refs.every((item) => {
    const value = typeof item === "string" ? item : item?.[key];
    return typeof value === "string" && value.length > 0 && fs.existsSync(path.resolve(rootDir, value));
  });
}

export function isBusinessReady(rootDir, item) {
  const implementation = item.implementation ?? {};
  const business = item.business ?? {};
  return Boolean(
    implementation.route &&
    refsExist(rootDir, implementation.sourceFiles ?? []) &&
    (implementation.apiBindings?.length ?? 0) > 0 &&
    (business.authoritativeStates?.length ?? 0) > 0 &&
    (business.permissions?.length ?? 0) > 0 &&
    business.entryCondition &&
    business.persistedResult &&
    business.recovery &&
    business.handoff &&
    ["staging-seed", "contract-state"].includes(business.scenarioKind) &&
    refsExist(rootDir, item.tests ?? [])
  );
}

export function isEvidenceReady(rootDir, item) {
  const evidence = item.edgeEvidence ?? [];
  const requiredStages = item.evidenceRequirement ?? ["entry", "result", "recovery"];
  const capturedStages = new Set(evidence.map((entry) => entry?.stage).filter(Boolean));
  return requiredStages.every((stage) => capturedStages.has(stage)) && evidence.every((entry) =>
    entry?.browser === "edge" &&
    entry?.actualApp === true &&
    entry?.capturedAt &&
    entry?.stage &&
    entry?.label &&
    entry?.file &&
    fs.existsSync(path.resolve(rootDir, entry.file))
  );
}

export function collectMetrics(rootDir, ledger, languageViolations) {
  const statusCounts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
  for (const item of ledger.slices) statusCounts[item.status] += 1;
  const businessReady = ledger.slices.filter((item) => isBusinessReady(rootDir, item));
  const evidenceReady = ledger.slices.filter((item) => isEvidenceReady(rootDir, item));
  const localized = ledger.slices.filter((item) => item.localization?.status === "COMPLETE");
  const accepted = ledger.slices.filter((item) => item.status === "ACCEPTED");
  const baseAccepted = ledger.carriers.filter((item) => item.baseFrame?.status === "ACCEPTED");
  return {
    sliceCount: ledger.slices.length,
    carrierCount: ledger.carriers.length,
    languageViolationCount: languageViolations.length,
    localizedCount: localized.length,
    businessReadyCount: businessReady.length,
    evidenceReadyCount: evidenceReady.length,
    acceptedCount: accepted.length,
    baseAcceptedCount: baseAccepted.length,
    statusCounts,
  };
}

export function releaseErrors(rootDir, ledger, structureErrors, languageViolations) {
  const errors = [...structureErrors];
  if (languageViolations.length) errors.push(`全中文门禁失败：仍有 ${languageViolations.length} 处可见英文`);
  const notLocalized = ledger.slices.filter((item) => item.localization?.status !== "COMPLETE");
  const notBusinessReady = ledger.slices.filter((item) => !isBusinessReady(rootDir, item));
  const noEvidence = ledger.slices.filter((item) => !isEvidenceReady(rootDir, item));
  const notAccepted = ledger.slices.filter((item) => item.status !== "ACCEPTED");
  const baseNotAccepted = ledger.carriers.filter((item) => item.baseFrame?.status !== "ACCEPTED");
  if (notLocalized.length) errors.push(`中文验收未完成：${notLocalized.length} 条切片`);
  if (notBusinessReady.length) errors.push(`真实商业链路资料不完整：${notBusinessReady.length} 条切片`);
  if (noEvidence.length) errors.push(`Edge 真实画面证据不完整：${noEvidence.length} 条切片`);
  if (baseNotAccepted.length) errors.push(`Base Frame 未验收：${baseNotAccepted.length} 个 Carrier`);
  if (notAccepted.length) errors.push(`最终未 ACCEPTED：${notAccepted.length} 条切片`);
  return errors;
}

export function candidateErrors(rootDir, ledger, structureErrors, languageViolations) {
  const errors = [...structureErrors];
  if (languageViolations.length) errors.push(`全中文门禁失败：仍有 ${languageViolations.length} 处可见英文`);
  const notLocalized = ledger.slices.filter((item) => item.localization?.status !== "COMPLETE");
  const notBusinessReady = ledger.slices.filter((item) => !isBusinessReady(rootDir, item));
  const noEvidence = ledger.slices.filter((item) => !isEvidenceReady(rootDir, item));
  const notEdgeVerified = ledger.slices.filter((item) => !["EDGE_VERIFIED", "ACCEPTED"].includes(item.status));
  const baseNotVerified = ledger.carriers.filter((item) => !["EDGE_VERIFIED", "ACCEPTED"].includes(item.baseFrame?.status));
  if (notLocalized.length) errors.push(`中文竣工未完成：${notLocalized.length} 条切片`);
  if (notBusinessReady.length) errors.push(`真实商业链路资料不完整：${notBusinessReady.length} 条切片`);
  if (noEvidence.length) errors.push(`Edge 真实画面证据不完整：${noEvidence.length} 条切片`);
  if (baseNotVerified.length) errors.push(`Base Frame 尚未 Edge 验证：${baseNotVerified.length} 个 Carrier`);
  if (notEdgeVerified.length) errors.push(`尚未达到 Edge 竣工状态：${notEdgeVerified.length} 条切片`);
  return errors;
}

export function ratchetErrors(metrics, baseline) {
  const errors = [];
  if (metrics.sliceCount !== baseline.sliceCount) errors.push(`切片数从 ${baseline.sliceCount} 变化为 ${metrics.sliceCount}`);
  if (metrics.carrierCount !== baseline.carrierCount) errors.push(`Carrier 数从 ${baseline.carrierCount} 变化为 ${metrics.carrierCount}`);
  if (metrics.languageViolationCount > baseline.languageViolationCount) {
    errors.push(`可见英文从 ${baseline.languageViolationCount} 增加到 ${metrics.languageViolationCount}`);
  }
  for (const key of ["localizedCount", "businessReadyCount", "evidenceReadyCount", "acceptedCount", "baseAcceptedCount"]) {
    if (metrics[key] < baseline[key]) errors.push(`${key} 从 ${baseline[key]} 回退到 ${metrics[key]}`);
  }
  return errors;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
