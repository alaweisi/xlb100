import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@xlb/config";

export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalizeJson(item)]));
  }
  return value;
}

export const canonicalWebhookPayload = (value: unknown): string => JSON.stringify(normalizeJson(value));

export function safeHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(`xlb-enterprise:${loadEnv().jwtSecret}`).digest();
}

export function encryptEnterpriseSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptEnterpriseSecret(value: string): string {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("invalid encrypted enterprise secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function signWebhook(secret: string, timestamp: string, payload: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

export function verifyWebhookSignature(secret: string, timestamp: string, payload: string, signature: string): boolean {
  if (!/^v1=[a-f0-9]{64}$/.test(signature)) return false;
  return safeHashEqual(signWebhook(secret, timestamp, payload), signature);
}

export function assertWebhookSignature(secret: string, timestamp: string, payload: string, signature: string): void {
  if (!verifyWebhookSignature(secret, timestamp, payload, signature)) throw new Error("invalid webhook signature");
}
