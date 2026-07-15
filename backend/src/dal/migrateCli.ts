import { runMigrations } from "./migrationRunner.js";

try {
  const result = await runMigrations();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const normalized: Error & { code?: string } = error instanceof Error
    ? error
    : new Error(String(error));
  console.error(JSON.stringify({
    error: {
      code: normalized.code ?? "MIGRATION_FAILED",
      message: normalized.message,
    },
  }));
  process.exitCode = 1;
}
