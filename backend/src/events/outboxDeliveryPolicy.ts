export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_DEFAULT_LEASE_SECONDS = 30;
export const OUTBOX_MAX_ERROR_LENGTH = 512;

export function retryDelaySeconds(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(8, attemptCount - 1));
  return Math.min(300, 2 ** exponent);
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : character;
  }).join("");
}

export function sanitizeOutboxError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return replaceControlCharacters(raw)
    .replace(/(password|secret|token|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OUTBOX_MAX_ERROR_LENGTH) || "outbox consumer failed";
}

export function outboxErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64) || "CONSUMER_ERROR";
  }
  return error instanceof Error && error.name
    ? error.name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64)
    : "CONSUMER_ERROR";
}
