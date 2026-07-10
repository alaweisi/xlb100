import { describe, expect, it } from "vitest";
import { FULFILLMENT_EVIDENCE_MAX_BYTES } from "@xlb/types";
import { validateEvidenceFile } from "../../backend/src/fulfillment/evidence/fileSafety.js";

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x01]);
const jpeg = Buffer.from([0xff,0xd8,0xff,0x01]);
const webp = Buffer.from("RIFF0000WEBPdata", "ascii");

describe("fulfillment evidence file safety", () => {
  it.each([
    [png, "image/png", "proof.png", "png"],
    [jpeg, "image/jpeg", "proof.jpeg", "jpg"],
    [webp, "image/webp", "proof.webp", "webp"],
  ])("accepts a signature-matched image", (bytes, contentType, fileName, extension) => {
    const result = validateEvidenceFile({ bytes, declaredContentType: contentType, originalFileName: fileName });
    expect(result.extension).toBe(extension);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    { bytes: Buffer.alloc(0), declaredContentType: "image/png", originalFileName: "empty.png" },
    { bytes: png, declaredContentType: "image/jpeg", originalFileName: "spoof.jpg" },
    { bytes: png, declaredContentType: "image/png", originalFileName: "wrong.jpg" },
    { bytes: png, declaredContentType: "image/png", originalFileName: "../escape.png" },
    { bytes: png, declaredContentType: "application/octet-stream", originalFileName: "proof.png" },
    { bytes: Buffer.alloc(FULFILLMENT_EVIDENCE_MAX_BYTES + 1, 0x89), declaredContentType: "image/png", originalFileName: "huge.png" },
  ])("rejects unsafe upload %#", (input) => {
    expect(() => validateEvidenceFile(input)).toThrow();
  });
});
