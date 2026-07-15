import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("lean governance policy", () => {
  it("keeps ordinary development free of legacy Train and Work Unit paperwork", () => {
    const agents = readRepoFile("AGENTS.md");
    const policy = readRepoFile("governance/00_LEAN_EXECUTION_POLICY.md");

    expect(agents).toContain("普通开发");
    expect(agents).toContain("不要求 Release Train、Work Unit、Manifest、Lease");
    expect(policy).toContain("普通开发不需要 Train Charter、Work Unit Manifest");
  });

  it("retains Human confirmation for high-risk and production work", () => {
    const policy = readRepoFile("governance/00_LEAN_EXECUTION_POLICY.md");

    expect(policy).toContain("高风险工程");
    expect(policy).toContain("push、deploy、生产数据、真实 Provider");
  });

  it("keeps the Integration Queue for high-risk and final Phase candidates", () => {
    const agents = readRepoFile("AGENTS.md");

    expect(agents).toContain("高风险工程以及 Phase 最终候选必须进入 Integration Queue");
  });
});
