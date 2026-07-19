import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDispatchStreamName } from "../../backend/src/streams/cityStreamNames.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function runScript(script: string) {
  return spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(root, "scripts", script),
    ],
    { encoding: "utf-8", timeout: 15_000, windowsHide: true },
  );
}

describe("noNationalDispatchStream", () => {
  it("gate script passes", () => {
    const result = runScript("check-no-national-dispatch-stream.ps1");

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }, 20_000);

  it("no national stream names in cityStreamNames", () => {
    expect(() => getDispatchStreamName("all")).toThrow();
    expect(() => getDispatchStreamName("global")).toThrow();
  });
});
