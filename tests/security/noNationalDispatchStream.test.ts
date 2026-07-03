import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDispatchStreamName } from "../../backend/src/streams/cityStreamNames.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function runScript(script: string): number {
  try {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", script)}"`,
      { encoding: "utf-8" },
    );
    return 0;
  } catch (err: unknown) {
    return (err as { status?: number }).status ?? 1;
  }
}

describe("noNationalDispatchStream", () => {
  it("gate script passes", () => {
    expect(runScript("check-no-national-dispatch-stream.ps1")).toBe(0);
  });

  it("no national stream names in cityStreamNames", () => {
    expect(() => getDispatchStreamName("all")).toThrow();
    expect(() => getDispatchStreamName("global")).toThrow();
  });
});
