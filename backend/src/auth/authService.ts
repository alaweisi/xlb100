import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { smsProvider } from "../providers/sms/mockSmsProvider.js";
import { createToken, verifyToken } from "./tokenAuth.js";
import {
  issueLoginOtp,
  readDebugLoginOtp,
  verifyLoginOtp,
  type DebugLoginOtpResult,
} from "./otpService.js";
import { hashPhoneIdentity, validateMainlandPhone } from "./phoneIdentity.js";

// Fixed-code login has been removed. Each login now uses a random,
// one-time Redis OTP with TTL and attempt limits.
// SMS delivery is intentionally routed to a truthful mock provider. Real SMS
// remains blocked until legal entity, credentials and production activation.

async function deliverMockLoginCode(
  scope: "customer" | "admin" | "worker",
  recipient: string,
  code: string,
  expiresAt: string,
): Promise<void> {
  await smsProvider.sendLoginOtp({
    recipient,
    code,
    purpose: `${scope}_login`,
    expiresAt,
  });
}

async function findOrCreateCustomer(
  phone: string,
): Promise<{ id: string; phone: string; name: string | null }> {
  const pool = getMysqlPool();
  const [rows] = await pool.query<(RowDataPacket & { id: string; phone: string; name: string | null })[]>(
    "SELECT id, phone, name FROM customers WHERE phone = ?",
    [phone],
  );
  if (rows.length > 0) return rows[0];

  const id = `customer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `用户${phone.slice(-4)}`;
  await pool.query(
    "INSERT INTO customers (id, phone, name) VALUES (?, ?, ?)",
    [id, phone, name],
  );
  return { id, phone, name };
}

async function findAdmin(
  username: string,
): Promise<{ id: string; username: string; role: string } | null> {
  const pool = getMysqlPool();
  const [rows] = await pool.query<(RowDataPacket & { id: string; username: string; role: string })[]>(
    "SELECT id, username, role FROM admin_users WHERE username = ?",
    [username],
  );
  return rows.length > 0 ? rows[0] : null;
}

async function findWorkerByPhone(
  phone: string,
): Promise<{ id: string; phoneMasked: string | null; status: string } | null> {
  const pool = getMysqlPool();
  const phoneHash = hashPhoneIdentity(phone);
  const [rows] = await pool.query<(RowDataPacket & { worker_id: string; phone_masked: string | null; status: string })[]>(
    "SELECT worker_id, phone_masked, status FROM worker_profiles WHERE phone_hash = ? LIMIT 1",
    [phoneHash],
  );
  const row = rows[0];
  return row ? { id: row.worker_id, phoneMasked: row.phone_masked, status: row.status } : null;
}

function validatePhone(phone: string): { ok: true } | { ok: false; error: string; statusCode: 400 } {
  if (!validateMainlandPhone(phone)) {
    return { ok: false, error: "invalid phone number", statusCode: 400 };
  }
  return { ok: true };
}

function validateUsername(username: string): { ok: true } | { ok: false; error: string; statusCode: 400 } {
  if (!username || username.length < 2) {
    return { ok: false, error: "invalid username", statusCode: 400 };
  }
  return { ok: true };
}

export interface LoginResult {
  ok: true;
  token: string;
  userId: string;
  role: string;
}

export interface LoginCodeRequestResult {
  ok: true;
  expiresAt: string;
  ttlSeconds: number;
  attemptsLeft: number;
}

type AuthError = {
  ok: false;
  error: string;
  statusCode: number;
  attemptsLeft?: number;
  code?: "WORKER_ACCESS_SUSPENDED" | "WORKER_ACCESS_DISABLED";
  workerAccessStatus?: "suspended" | "disabled";
};

export async function requestCustomerLoginCode(
  phone: string,
): Promise<LoginCodeRequestResult | AuthError> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.ok) return phoneResult;

  const issued = await issueLoginOtp("customer", phone);
  if (!issued.ok) return issued;
  await deliverMockLoginCode("customer", phone, issued.code, issued.expiresAt);
  return {
    ok: true,
    expiresAt: issued.expiresAt,
    ttlSeconds: issued.ttlSeconds,
    attemptsLeft: issued.attemptsLeft,
  };
}

export async function requestAdminLoginCode(
  username: string,
): Promise<LoginCodeRequestResult | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;

  const admin = await findAdmin(username);
  if (!admin) {
    return { ok: false, error: "admin not found", statusCode: 404 };
  }

  const issued = await issueLoginOtp("admin", username);
  if (!issued.ok) return issued;
  await deliverMockLoginCode("admin", username, issued.code, issued.expiresAt);
  return {
    ok: true,
    expiresAt: issued.expiresAt,
    ttlSeconds: issued.ttlSeconds,
    attemptsLeft: issued.attemptsLeft,
  };
}

export async function requestWorkerLoginCode(
  phone: string,
): Promise<LoginCodeRequestResult | AuthError> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.ok) return phoneResult;

  const worker = await findWorkerByPhone(phone);
  if (!worker) {
    return { ok: false, error: "worker not found", statusCode: 404 };
  }
  const issued = await issueLoginOtp("worker", phone);
  if (!issued.ok) return issued;
  await deliverMockLoginCode("worker", phone, issued.code, issued.expiresAt);
  return {
    ok: true,
    expiresAt: issued.expiresAt,
    ttlSeconds: issued.ttlSeconds,
    attemptsLeft: issued.attemptsLeft,
  };
}

export function debugCustomerLoginCode(phone: string): Promise<DebugLoginOtpResult> {
  return readDebugLoginOtp("customer", phone);
}

export function debugAdminLoginCode(username: string): Promise<DebugLoginOtpResult> {
  return readDebugLoginOtp("admin", username);
}

export function debugWorkerLoginCode(phone: string): Promise<DebugLoginOtpResult> {
  return readDebugLoginOtp("worker", phone);
}

export async function customerLogin(
  phone: string,
  code: string,
): Promise<LoginResult | AuthError> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.ok) return phoneResult;

  const otp = await verifyLoginOtp("customer", phone, code);
  if (!otp.ok) return otp;

  const customer = await findOrCreateCustomer(phone);
  const token = createToken(customer.id, "customer", "customer");
  return { ok: true, token, userId: customer.id, role: "customer" };
}

export async function adminLogin(
  username: string,
  code: string,
): Promise<LoginResult | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;

  const admin = await findAdmin(username);
  if (!admin) {
    return { ok: false, error: "admin not found", statusCode: 404 };
  }

  const otp = await verifyLoginOtp("admin", username, code);
  if (!otp.ok) return otp;

  const token = createToken(admin.id, admin.role, "admin");
  return { ok: true, token, userId: admin.id, role: admin.role };
}

export async function workerLogin(
  phone: string,
  code: string,
): Promise<LoginResult | AuthError> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.ok) return phoneResult;

  const worker = await findWorkerByPhone(phone);
  if (!worker) {
    return { ok: false, error: "worker not found", statusCode: 404 };
  }
  const otp = await verifyLoginOtp("worker", phone, code);
  if (!otp.ok) return otp;

  if (worker.status === "suspended" || worker.status === "disabled") {
    return {
      ok: false,
      error: worker.status === "suspended" ? "worker access is suspended" : "worker access is disabled",
      statusCode: 403,
      code: worker.status === "suspended" ? "WORKER_ACCESS_SUSPENDED" : "WORKER_ACCESS_DISABLED",
      workerAccessStatus: worker.status,
    };
  }
  if (worker.status !== "active") {
    return { ok: false, error: "worker access is unavailable", statusCode: 403 };
  }

  const token = createToken(worker.id, "worker", "worker");
  return { ok: true, token, userId: worker.id, role: "worker" };
}

export { createToken, verifyToken };
