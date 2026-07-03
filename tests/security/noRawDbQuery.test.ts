import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const backendSrc = path.resolve("backend/src");
const dalDir = path.join(backendSrc, "dal");

const forbidden = [
  "createPool",
  "createConnection",
  "mysql.createPool",
  "mysql.createConnection",
];

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("noRawDbQuery", () => {
  it("backend modules outside dal must not create mysql pools directly", () => {
    const violations: string[] = [];
    const files = collectTsFiles(backendSrc).filter(
      (f) => !f.startsWith(dalDir),
    );

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (content.includes(pattern)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
