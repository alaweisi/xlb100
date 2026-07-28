import type { RowDataPacket } from "mysql2/promise";
import { loadEnv, type EnvConfig } from "@xlb/config";
import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { smsProvider } from "../providers/sms/mockSmsProvider.js";
import {
  createStagingDemoToken,
  createToken,
  verifyToken,
} from "./tokenAuth.js";
import {
  issueLoginOtp,
  readDebugLoginOtp,
  verifyLoginOtp,
  type DebugLoginOtpResult,
} from "./otpService.js";
import { hashPhoneIdentity, validateMainlandPhone } from "./phoneIdentity.js";
import {
  adminHasExactDemoCity,
  workerHasExactDemoCity,
} from "./stagingDemoIdentity.js";
import { oaIdentityService } from "../oa/oaIdentityService.js";

// Fixed-code login has been removed. Each login now uses a random,
// one-time Redis OTP with TTL and attempt limits.
// SMS delivery is intentionally routed to a truthful mock provider. Real SMS
// remains blocked until legal entity, credentials and production activation.

const STAGING_DEMO_CUSTOMER_ID = INVESTOR_DEMO_IDENTITIES.customer.id;
const INVESTOR_DEMO_ID_PREFIX = "investor-demo-";

async function deliverMockLoginCode(
  scope: "customer" | "admin" | "worker" | "oa" | "dashboard",
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
  stagingDemoCode?: string;
}

type AuthError = { ok: false; error: string; statusCode: number; attemptsLeft?: number };

export function stagingDemoCodeFor(
  env: Pick<
    EnvConfig,
    "nodeEnv" | "stagingDemoCustomerAuthEnabled" | "stagingDemoCustomerPhone"
  >,
  phone: string,
  code: string,
): string | undefined {
  return env.nodeEnv === "staging"
    && env.stagingDemoCustomerAuthEnabled
    && phone === env.stagingDemoCustomerPhone
    ? code
    : undefined;
}

export function stagingInvestorDemoCodeFor(
  env: Pick<
    EnvConfig,
    | "nodeEnv"
    | "stagingInvestorDemoAuthEnabled"
    | "stagingDemoWorkerPhone"
    | "stagingDemoAdminUsername"
  >,
  scope: "worker" | "admin",
  identifier: string,
  code: string,
): string | undefined {
  if (env.nodeEnv !== "staging" || !env.stagingInvestorDemoAuthEnabled) {
    return undefined;
  }
  const expected = scope === "worker"
    ? env.stagingDemoWorkerPhone
    : env.stagingDemoAdminUsername;
  return identifier === expected ? code : undefined;
}

export async function requestCustomerLoginCode(
  phone: string,
): Promise<LoginCodeRequestResult | AuthError> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.ok) return phoneResult;

  const issued = await issueLoginOtp("customer", phone);
  if (!issued.ok) return issued;
  await deliverMockLoginCode("customer", phone, issued.code, issued.expiresAt);
  const env = loadEnv();
  const stagingDemoCode = stagingDemoCodeFor(env, phone, issued.code);
  return {
    ok: true,
    expiresAt: issued.expiresAt,
    ttlSeconds: issued.ttlSeconds,
    attemptsLeft: issued.attemptsLeft,
    ...(stagingDemoCode ? { stagingDemoCode } : {}),
  };
}

export async function requestAdminLoginCode(
  username: string,
): Promise<LoginCodeRequestResult | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;

  const admin = await findAdmin(username);
  // Always create the same opaque OTP state and response for syntactically
  // valid identities. Delivery remains restricted to an existing account.
  const issued = await issueLoginOtp("admin", username);
  if (!issued.ok) return issued;
  if (admin) {
    await deliverMockLoginCode("admin", username, issued.code, issued.expiresAt);
  }
  const env = loadEnv();
  const safeDemoAdmin = admin
    && admin.id === env.stagingDemoAdminUserId
    && await adminHasExactDemoCity(admin, env.stagingDemoCityCode);
  const stagingDemoCode = safeDemoAdmin
    ? stagingInvestorDemoCodeFor(env, "admin", username, issued.code)
    : undefined;
  return {
    ok: true,
    expiresAt: issued.expiresAt,
    ttlSeconds: issued.ttlSeconds,
    attemptsLeft: issued.attemptsLeft,
    ...(stagingDemoCode ? { stagingDemoCode } : {}),
  };
}

export async function requestDashboardLoginCode(
  username: string,
): Promise<LoginCodeRequestResult | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;
  const admin = await findAdmin(username);
  if (!admin || !["admin", "operator", "auditor"].includes(admin.role)) {
    return { ok: false, error: "dashboard identity not found", statusCode: 404 };
  }
  const issued = await issueLoginOtp("dashboard", username);
  if (!issued.ok) return issued;
  await deliverMockLoginCode("dashboard", username, issued.code, issued.expiresAt);
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
  // Missing and inactive workers receive the same public response and Redis
  // work as active workers, but never receive the verification code.
  const issued = await issueLoginOtp("worker", phone);
  if (!issued.ok) return issued;
  if (worker?.status === "active") {
    await deliverMockLoginCode("worker", phone, issued.code, issued.expiresAt);
  }
  const env = loadEnv();
  const safeDemoWorker = worker
    && worker.status === "active"
    && worker.id === env.stagingDemoWorkerId
    && await workerHasExactDemoCity(worker.id, env.stagingDemoCityCode);
  const stagingDemoCode = safeDemoWorker
    ? stagingInvestorDemoCodeFor(env, "worker", phone, issued.code)
    : undefined;
  return {
    ok: true,
    expiresAt: issued.expiresAt,
    ttlSeconds: issued.ttlSeconds,
    attemptsLeft: issued.attemptsLeft,
    ...(stagingDemoCode ? { stagingDemoCode } : {}),
  };
}

export async function requestOaLoginCode(
  username: string,
): Promise<LoginCodeRequestResult | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;
  const profile = await oaIdentityService.findLoginProfile(username);
  const issued = await issueLoginOtp("oa", username);
  if (!issued.ok) return issued;
  if (profile) {
    await deliverMockLoginCode("oa", username, issued.code, issued.expiresAt);
  }
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

export function debugDashboardLoginCode(username: string): Promise<DebugLoginOtpResult> {
  return readDebugLoginOtp("dashboard", username);
}

export function debugWorkerLoginCode(phone: string): Promise<DebugLoginOtpResult> {
  return readDebugLoginOtp("worker", phone);
}

export function debugOaLoginCode(username: string): Promise<DebugLoginOtpResult> {
  return readDebugLoginOtp("oa", username);
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
  const env = loadEnv();
  const isConfiguredDemo = env.nodeEnv === "staging"
    && env.stagingDemoCustomerAuthEnabled
    && phone === env.stagingDemoCustomerPhone
    && customer.id === STAGING_DEMO_CUSTOMER_ID;
  if (
    customer.id === STAGING_DEMO_CUSTOMER_ID
    && !isConfiguredDemo
  ) {
    return { ok: false, error: "staging demo identity is disabled", statusCode: 401 };
  }
  const token = isConfiguredDemo
    ? createStagingDemoToken(customer.id, "customer", "customer", env.stagingDemoCityCode)
    : createToken(customer.id, "customer", "customer");
  return { ok: true, token, userId: customer.id, role: "customer" };
}

export async function adminLogin(
  username: string,
  code: string,
): Promise<LoginResult | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;

  const otp = await verifyLoginOtp("admin", username, code);
  if (!otp.ok) return otp;

  const admin = await findAdmin(username);
  if (!admin) {
    return { ok: false, error: "invalid admin credentials", statusCode: 401 };
  }

  const env = loadEnv();
  const isConfiguredDemo = env.nodeEnv === "staging"
    && env.stagingInvestorDemoAuthEnabled
    && username === env.stagingDemoAdminUsername
    && admin.id === env.stagingDemoAdminUserId
    && await adminHasExactDemoCity(admin, env.stagingDemoCityCode);
  if (admin.id.startsWith(INVESTOR_DEMO_ID_PREFIX) && !isConfiguredDemo) {
    return { ok: false, error: "staging demo identity is disabled", statusCode: 401 };
  }
  const token = isConfiguredDemo
    ? createStagingDemoToken(admin.id, admin.role, "admin", env.stagingDemoCityCode)
    : createToken(admin.id, admin.role, "admin");
  return { ok: true, token, userId: admin.id, role: admin.role };
}

export async function dashboardLogin(
  username: string,
  code: string,
): Promise<LoginResult | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;
  const admin = await findAdmin(username);
  if (!admin || !["admin", "operator", "auditor"].includes(admin.role)) {
    return { ok: false, error: "invalid dashboard credentials", statusCode: 401 };
  }
  const otp = await verifyLoginOtp("dashboard", username, code);
  if (!otp.ok) return otp;
  const token = createToken(admin.id, admin.role, "dashboard");
  return { ok: true, token, userId: admin.id, role: admin.role };
}

export async function workerLogin(
  phone: string,
  code: string,
): Promise<LoginResult | AuthError> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.ok) return phoneResult;

  const otp = await verifyLoginOtp("worker", phone, code);
  if (!otp.ok) return otp;

  const worker = await findWorkerByPhone(phone);
  if (!worker || worker.status !== "active") {
    return { ok: false, error: "invalid worker credentials", statusCode: 401 };
  }

  const env = loadEnv();
  const isConfiguredDemo = env.nodeEnv === "staging"
    && env.stagingInvestorDemoAuthEnabled
    && phone === env.stagingDemoWorkerPhone
    && worker.id === env.stagingDemoWorkerId
    && await workerHasExactDemoCity(worker.id, env.stagingDemoCityCode);
  if (worker.id.startsWith(INVESTOR_DEMO_ID_PREFIX) && !isConfiguredDemo) {
    return { ok: false, error: "staging demo identity is disabled", statusCode: 401 };
  }
  const token = isConfiguredDemo
    ? createStagingDemoToken(worker.id, "worker", "worker", env.stagingDemoCityCode)
    : createToken(worker.id, "worker", "worker");
  return { ok: true, token, userId: worker.id, role: "worker" };
}

export async function oaLogin(
  username: string,
  code: string,
  deviceSummary?: string,
): Promise<(LoginResult & {
  sessionId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationType: string;
  expiresAt: string;
}) | AuthError> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return usernameResult;
  const otp = await verifyLoginOtp("oa", username, code);
  if (!otp.ok) return otp;
  const profile = await oaIdentityService.findLoginProfile(username);
  if (!profile) {
    return { ok: false, error: "invalid OA credentials", statusCode: 401 };
  }
  const session = await oaIdentityService.createSession(profile, deviceSummary);
  return {
    ok: true,
    token: session.token,
    userId: session.userId,
    role: session.legacyRole,
    sessionId: session.sessionId,
    membershipId: session.membershipId,
    organizationId: session.organizationId,
    organizationName: session.organizationName,
    organizationType: session.organizationType,
    expiresAt: session.expiresAt,
  };
}

export { createToken, verifyToken };
