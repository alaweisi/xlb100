#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseEnrollmentArgs(argv) {
  const options = { workerId: "", phone: "", dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--worker-id" || argument === "--phone") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === "--worker-id") options.workerId = value;
      else options.phone = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.workerId) throw new Error("--worker-id is required");
  if (!options.phone) throw new Error("--phone is required");
  return options;
}

export function validateEnrollmentInput({ workerId, phone, secret }) {
  if (!/^[A-Za-z0-9:_-]{1,64}$/.test(workerId)) {
    throw new Error("workerId must be 1-64 safe identifier characters");
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new Error("phone must be a valid mainland mobile number");
  }
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_PHONE_HASH_SECRET must be explicitly set to at least 32 characters");
  }
}

export function derivePhoneHash(phone, secret) {
  return createHmac("sha256", secret)
    .update(`xlb:worker-phone:v1:${phone}`, "utf8")
    .digest("hex");
}

export function maskVerifiedPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export async function enrollWorkerPhone(options, dependencies) {
  const { workerId, phone, dryRun } = options;
  const { secret, connection } = dependencies;
  validateEnrollmentInput({ workerId, phone, secret });
  const phoneHash = derivePhoneHash(phone, secret);
  const phoneMasked = maskVerifiedPhone(phone);

  await connection.beginTransaction();
  try {
    const [workerRows] = await connection.execute(
      "SELECT worker_id, phone_hash FROM worker_profiles WHERE worker_id = ? FOR UPDATE",
      [workerId],
    );
    if (workerRows.length !== 1) throw new Error(`worker not found: ${workerId}`);
    if (workerRows[0].phone_hash && workerRows[0].phone_hash !== phoneHash) {
      throw new Error(`worker already has a different phone hash: ${workerId}`);
    }

    const [duplicateRows] = await connection.execute(
      "SELECT worker_id FROM worker_profiles WHERE phone_hash = ? AND worker_id <> ? LIMIT 1",
      [phoneHash, workerId],
    );
    if (duplicateRows.length > 0) {
      throw new Error(`phone identity is already assigned to worker: ${duplicateRows[0].worker_id}`);
    }

    if (!dryRun) {
      const [result] = await connection.execute(
        `UPDATE worker_profiles
            SET phone_hash = ?, phone_masked = ?
          WHERE worker_id = ? AND (phone_hash IS NULL OR phone_hash = ?)`,
        [phoneHash, phoneMasked, workerId, phoneHash],
      );
      if (result.affectedRows !== 1) throw new Error(`worker enrollment was not applied: ${workerId}`);
      await connection.commit();
    } else {
      await connection.rollback();
    }
    return { workerId, phoneMasked, dryRun };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const options = parseEnrollmentArgs(process.argv.slice(2));
  const secret = process.env.AUTH_PHONE_HASH_SECRET;
  validateEnrollmentInput({ ...options, secret });

  // pnpm keeps mysql2 as a backend dependency rather than a root dependency.
  const backendRequire = createRequire(path.join(root, "backend", "package.json"));
  const { createConnection } = backendRequire("mysql2/promise");
  const connection = await createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.MYSQL_PORT ?? "3306", 10),
    database: process.env.MYSQL_DATABASE ?? "xlb_local",
    user: process.env.MYSQL_USER ?? "xlb",
    password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
  });
  try {
    const result = await enrollWorkerPhone(options, { secret, connection });
    process.stdout.write(
      `${result.dryRun ? "DRY RUN" : "ENROLLED"} ${result.workerId} ${result.phoneMasked}\n`,
    );
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`worker phone enrollment failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
