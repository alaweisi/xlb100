import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  derivePhoneHash,
  enrollWorkerPhone,
  parseEnrollmentArgs,
  validateEnrollmentInput,
} from "../../scripts/enroll-worker-phone.mjs";

const secret = "unit-test-worker-phone-secret-at-least-32-characters";

describe("trusted worker phone enrollment CLI", () => {
  it("requires explicit worker and verified full phone arguments", () => {
    expect(parseEnrollmentArgs([
      "--worker-id", "worker-demo-hangzhou",
      "--phone", "13800000001",
      "--dry-run",
    ])).toEqual({ workerId: "worker-demo-hangzhou", phone: "13800000001", dryRun: true });
    expect(() => parseEnrollmentArgs(["--phone", "13800000001"])).toThrow("--worker-id is required");
    expect(() => parseEnrollmentArgs(["--worker-id", "worker-1", "--unknown"])).toThrow("unknown argument");
  });

  it("rejects unsafe identifiers, masked phones, and missing secrets", () => {
    expect(() => validateEnrollmentInput({ workerId: "worker 1", phone: "13800000001", secret })).toThrow("workerId");
    expect(() => validateEnrollmentInput({ workerId: "worker-1", phone: "138****0001", secret })).toThrow("phone");
    expect(() => validateEnrollmentInput({ workerId: "worker-1", phone: "13800000001", secret: "" })).toThrow("AUTH_PHONE_HASH_SECRET");
  });

  it("uses the same domain-separated HMAC as runtime authentication", () => {
    expect(derivePhoneHash("13800000001", secret)).toBe(
      createHmac("sha256", secret)
        .update("xlb:worker-phone:v1:13800000001", "utf8")
        .digest("hex"),
    );
  });

  it("dry-runs an exact worker-id enrollment without executing an update", async () => {
    const connection = {
      beginTransaction: vi.fn(),
      execute: vi.fn()
        .mockResolvedValueOnce([[{ worker_id: "worker-1", phone_hash: null }]])
        .mockResolvedValueOnce([[]]),
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    await expect(enrollWorkerPhone(
      { workerId: "worker-1", phone: "13800000001", dryRun: true },
      { secret, connection },
    )).resolves.toEqual({ workerId: "worker-1", phoneMasked: "138****0001", dryRun: true });
    expect(connection.execute).toHaveBeenCalledTimes(2);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it("fails before update when the hash belongs to another worker", async () => {
    const connection = {
      beginTransaction: vi.fn(),
      execute: vi.fn()
        .mockResolvedValueOnce([[{ worker_id: "worker-1", phone_hash: null }]])
        .mockResolvedValueOnce([[{ worker_id: "worker-2" }]]),
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    await expect(enrollWorkerPhone(
      { workerId: "worker-1", phone: "13800000001", dryRun: false },
      { secret, connection },
    )).rejects.toThrow("already assigned to worker: worker-2");
    expect(connection.execute).toHaveBeenCalledTimes(2);
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it("commits a verified enrollment and allows the same worker/hash idempotently", async () => {
    const phone = "13800000001";
    const phoneHash = derivePhoneHash(phone, secret);
    const connection = {
      beginTransaction: vi.fn(),
      execute: vi.fn()
        .mockResolvedValueOnce([[{ worker_id: "worker-1", phone_hash: phoneHash }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: vi.fn(),
      rollback: vi.fn(),
    };

    await expect(enrollWorkerPhone(
      { workerId: "worker-1", phone, dryRun: false },
      { secret, connection },
    )).resolves.toEqual({ workerId: "worker-1", phoneMasked: "138****0001", dryRun: false });
    expect(connection.execute).toHaveBeenCalledTimes(3);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });
});
