import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  candidateErrors,
  EXPECTED,
  isBusinessReady,
  isEvidenceReady,
  parseBindings,
  ratchetErrors,
  scanVisibleLanguage,
  syncLedger,
  validateProgression,
  validateStructure,
} from "./control-lib.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parsedRepository() {
  return parseBindings(
    fs.readFileSync(path.join(rootDir, "docs/design/ui/vertical-slices/FRAME_MAP_SLICE_BINDINGS.md"), "utf8"),
    fs.readFileSync(path.join(rootDir, "docs/design/ui/vertical-slices/SLICE_SCOPE_BASELINE.md"), "utf8"),
  );
}

test("214 条切片与 36 个 Carrier 能从权威文档稳定生成", () => {
  const parsed = parsedRepository();
  assert.equal(parsed.slices.length, EXPECTED.slices);
  assert.equal(parsed.carriers.length, EXPECTED.carriers);
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED.terminals).map((terminal) => [terminal, parsed.slices.filter((item) => item.terminal === terminal).length])),
    EXPECTED.terminals,
  );
  assert.equal(new Set(parsed.slices.map((item) => item.sliceId)).size, EXPECTED.slices);
});

test("同步总账保留施工字段，但刷新不可变映射字段", () => {
  const parsed = parsedRepository();
  const initial = syncLedger(parsed);
  initial.slices[0].status = "READY";
  initial.slices[0].implementation.route = "/customer/";
  initial.slices[0].carrierName = "错误旧名称";
  const next = syncLedger(parsed, initial);
  assert.equal(next.slices[0].status, "READY");
  assert.equal(next.slices[0].implementation.route, "/customer/");
  assert.equal(next.slices[0].carrierName, parsed.slices[0].carrierName);
  assert.deepEqual(validateStructure(next, parsed), []);
});

test("中文门禁只报告可见英文，并允许中文语境中的技术缩写", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "xlb-ui-language-"));
  for (const app of ["customer", "worker", "admin"]) fs.mkdirSync(path.join(temporary, "apps", app, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(temporary, "apps/customer/src/Page.tsx"),
    `export const Page=()=> <main><h1>中文标题</h1><label aria-label="API 状态">API 状态</label><button>Submit order</button></main>;`,
    "utf8",
  );
  const violations = scanVisibleLanguage(temporary, { allowedTechnicalTokens: ["API"] });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].text, "Submit order");
});

test("真实商业门禁与 Edge 证据必须引用存在的文件", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "xlb-ui-business-"));
  fs.writeFileSync(path.join(temporary, "page.tsx"), "export {};", "utf8");
  fs.writeFileSync(path.join(temporary, "test.ts"), "export {};", "utf8");
  fs.writeFileSync(path.join(temporary, "screen.png"), "png", "utf8");
  const item = {
    implementation: { route: "/customer/orders", sourceFiles: ["page.tsx"], apiBindings: ["orders.get"] },
    business: {
      authoritativeStates: ["pending"],
      permissions: ["customer:self"],
      entryCondition: "订单存在",
      persistedResult: "订单详情持久显示结果",
      recovery: "重新读取订单",
      handoff: "后台派单",
      scenarioKind: "contract-state",
    },
    tests: ["test.ts"],
    evidenceRequirement: ["result"],
    edgeEvidence: [{ browser: "edge", actualApp: true, capturedAt: "2026-07-17T00:00:00Z", stage: "result", label: "成功结果", file: "screen.png" }],
  };
  assert.equal(isBusinessReady(temporary, item), true);
  assert.equal(isEvidenceReady(temporary, item), true);
});

test("状态不能超前于业务事实、代码、测试和 Edge 证据", () => {
  const parsed = parsedRepository();
  const ledger = syncLedger(parsed);
  ledger.slices[0].status = "ACCEPTED";
  const errors = validateProgression(rootDir, ledger);
  assert.ok(errors.some((item) => item.includes("缺少后端权威状态")));
  assert.ok(errors.some((item) => item.includes("缺少真实路由")));
  assert.ok(errors.some((item) => item.includes("Edge 真实画面证据不完整")));
  assert.ok(errors.some((item) => item.includes("中文状态未完成")));
});

test("棘轮允许进步但阻止新增英文和验收回退", () => {
  const baseline = { sliceCount: 214, carrierCount: 36, languageViolationCount: 10, localizedCount: 2, businessReadyCount: 2, evidenceReadyCount: 1, acceptedCount: 1, baseAcceptedCount: 1 };
  assert.deepEqual(ratchetErrors({ ...baseline, languageViolationCount: 9, acceptedCount: 2 }, baseline), []);
  const errors = ratchetErrors({ ...baseline, languageViolationCount: 11, acceptedCount: 0 }, baseline);
  assert.equal(errors.length, 2);
});

test("竣工候选门禁要求 Edge 齐备，但不提前要求人工 ACCEPTED", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "xlb-ui-candidate-"));
  fs.writeFileSync(path.join(temporary, "page.tsx"), "export {};", "utf8");
  fs.writeFileSync(path.join(temporary, "test.ts"), "export {};", "utf8");
  fs.writeFileSync(path.join(temporary, "screen.png"), "png", "utf8");
  const evidence = [{ browser: "edge", actualApp: true, capturedAt: "2026-07-18T00:00:00Z", stage: "result", label: "结果", file: "screen.png" }];
  const slice = {
    status: "EDGE_VERIFIED",
    localization: { status: "COMPLETE" },
    implementation: { route: "/customer/", sourceFiles: ["page.tsx"], apiBindings: ["catalog.list"] },
    business: { authoritativeStates: ["available"], permissions: ["customer"], entryCondition: "进入", persistedResult: "读取结果", recovery: "重试", handoff: "进入下单", scenarioKind: "contract-state" },
    tests: ["test.ts"], evidenceRequirement: ["result"], edgeEvidence: evidence,
  };
  const carrier = { baseFrame: { status: "EDGE_VERIFIED", evidenceRequirement: ["result"], edgeEvidence: evidence } };
  assert.deepEqual(candidateErrors(temporary, { slices: [slice], carriers: [carrier] }, [], []), []);
  assert.ok(candidateErrors(temporary, { slices: [{ ...slice, status: "TESTED" }], carriers: [carrier] }, [], []).some((item) => item.includes("尚未达到 Edge 竣工状态")));
});
