import { createHash } from "node:crypto";
import { extname } from "node:path";
import { FULFILLMENT_EVIDENCE_MAX_BYTES } from "@xlb/types";

export type EvidenceContentType = "image/jpeg" | "image/png" | "image/webp";

export class EvidenceFileValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) { super(message); this.name = "EvidenceFileValidationError"; }
}

const EXTENSIONS: Record<EvidenceContentType, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

function detectContentType(bytes: Buffer): EvidenceContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function hasUnsafeFileNameCharacter(fileName: string): boolean {
  return Array.from(fileName).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f || character === "/" || character === "\\";
  });
}

export function validateEvidenceFile(input: { bytes: Buffer; declaredContentType: string; originalFileName: string }): {
  contentType: EvidenceContentType;
  checksumSha256: string;
  safeOriginalFileName: string;
  extension: "jpg" | "png" | "webp";
} {
  if (input.bytes.length === 0) throw new EvidenceFileValidationError("evidence file must not be empty");
  if (input.bytes.length > FULFILLMENT_EVIDENCE_MAX_BYTES) throw new EvidenceFileValidationError("evidence file exceeds 5 MiB limit");
  if (!(input.declaredContentType in EXTENSIONS)) throw new EvidenceFileValidationError("evidence content type must be image/jpeg, image/png, or image/webp");
  const contentType = input.declaredContentType as EvidenceContentType;
  const detected = detectContentType(input.bytes);
  if (!detected || detected !== contentType) throw new EvidenceFileValidationError("declared content type does not match binary image signature");
  const fileName = input.originalFileName.trim();
  if (!fileName || fileName.length > 255 || hasUnsafeFileNameCharacter(fileName) || fileName.includes("..")) {
    throw new EvidenceFileValidationError("unsafe evidence file name");
  }
  if (!EXTENSIONS[contentType].includes(extname(fileName).toLowerCase())) throw new EvidenceFileValidationError("file extension does not match content type");
  return {
    contentType,
    checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
    safeOriginalFileName: fileName,
    extension: contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp",
  };
}
