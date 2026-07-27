import fs from "node:fs";
import path from "node:path";

type EngineeringReporter =
  | [["list"]]
  | [["list"], ["json", { outputFile: string }]];

export function engineeringReporter(): EngineeringReporter {
  const evidenceDirectory =
    process.env.XLB_PLAYWRIGHT_EVIDENCE_DIR?.trim();
  const reportId = process.env.XLB_PLAYWRIGHT_REPORT_ID?.trim();
  if (!evidenceDirectory && !reportId) return [["list"]];
  if (!evidenceDirectory || !reportId) {
    throw new Error(
      "XLB_PLAYWRIGHT_EVIDENCE_DIR and XLB_PLAYWRIGHT_REPORT_ID must be set together",
    );
  }
  if (!/^[a-z0-9-]{1,120}$/u.test(reportId)) {
    throw new Error("XLB_PLAYWRIGHT_REPORT_ID is invalid");
  }
  const outputDirectory = path.resolve(evidenceDirectory);
  fs.mkdirSync(outputDirectory, { recursive: true });
  return [
    ["list"],
    ["json", { outputFile: path.join(outputDirectory, `${reportId}.json`) }],
  ];
}
