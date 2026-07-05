import { createHash } from "node:crypto";

// Pure deterministic hash kernel.
// Callers own cityCode/city_code inclusion when hashing city-scoped source state.
export function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "bigint") return JSON.stringify(value.toString());

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}
