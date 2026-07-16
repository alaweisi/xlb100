import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const examplesRoot = path.join(repoRoot, "deploy/tke/contracts/examples");

const readExample = name => JSON.parse(
  readFileSync(path.join(examplesRoot, `${name}.example.json`), "utf8"),
);

export const clone = value => structuredClone(value);

export function lockedDigests(imageLock) {
  return Object.fromEntries(
    Object.entries(imageLock.images).map(([name, image]) => [name, image.digest]),
  );
}

export function buildReleaseFixture(mutate) {
  const fixture = {
    releaseManifest: readExample("release-manifest"),
    imageLock: readExample("images-lock"),
    cloudBundle: readExample("cloud-bundle"),
    checkpoint: readExample("checkpoint"),
    evidenceBundle: readExample("evidence-bundle"),
  };
  mutate?.(fixture);
  return fixture;
}
