import { createHmac } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { loadEnv } from "@xlb/config";

// ── MOCK verification code ──
// TODO: replace with real SMS verification in production
const MOCK_CODE = "1234";

// ── Simple HMAC JWT ──
// No external JWT library dependency; keeps the build lean.
// Production replacement: switch to jose or jsonwebtoken for standard JWT.

interface TokenPayload {
  sub: string;
  role: string;
  appType: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function sign(payload: TokenPayload, secret: string): string {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = base64UrlEncode(
    createHmac("sha256", secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): { ok: true; payload: TokenPayload } | { ok: false; error: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "invalid token format" };

    const [headerB64, bodyB64, sigB64] = parts;
    const env = loadEnv();
    const expectedSig = base64UrlEncode(
      createHmac("sha256", env.jwtSecret).update(`${headerB64}.${bodyB64}`).digest(),
    );

    if (sigB64 !== expectedSig) return { ok: false, error: "invalid token signature" };

    const payload = JSON.parse(base64UrlDecode(bodyB64)) as TokenPayload;

    if (payload.exp && Date.now() > payload.exp * 1000) {
      return { ok: false, error: "token expired" };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, error: "malformed token" };
  }
}

export function createToken(sub: string, role: string, appType: string): string {
  const env = loadEnv();
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub,
    role,
    appType,
    iat: now,
    exp: now + 86400, // 24 hours
  };
  return sign(payload, env.jwtSecret);
}

// ── Customer login ──

async function findOrCreateCustomer(
  phone: string,
): Promise<{ id: string; phone: string; name: string | null }> {
  const pool = getMysqlPool();
  const [rows] = await pool.query<(RowDataPacket & { id: string; phone: string; name: string | null })[]>(
    "SELECT id, phone, name FROM customers WHERE phone = ?",
    [phone],
  );
  if (rows.length > 0) return rows[0];

  // Auto-register on first login
  const id = `customer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `用户${phone.slice(-4)}`;
  await pool.query(
    "INSERT INTO customers (id, phone, name) VALUES (?, ?, ?)",
    [id, phone, name],
  );
  return { id, phone, name };
}

// ── Admin login ──

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

// ── Public API ──

export interface LoginResult {
  ok: true;
  token: string;
  userId: string;
  role: string;
}

export async function customerLogin(
  phone: string,
  code: string,
): Promise<LoginResult | { ok: false; error: string; statusCode: number }> {
  if (!phone || !/^\d{11}$/.test(phone)) {
    return { ok: false, error: "invalid phone number", statusCode: 400 };
  }
  if (code !== MOCK_CODE) {
    return { ok: false, error: "invalid verification code", statusCode: 401 };
  }

  const customer = await findOrCreateCustomer(phone);
  const token = createToken(customer.id, "customer", "customer");
  return { ok: true, token, userId: customer.id, role: "customer" };
}

export async function adminLogin(
  username: string,
  code: string,
): Promise<LoginResult | { ok: false; error: string; statusCode: number }> {
  if (!username || username.length < 2) {
    return { ok: false, error: "invalid username", statusCode: 400 };
  }
  if (code !== MOCK_CODE) {
    return { ok: false, error: "invalid verification code", statusCode: 401 };
  }

  const admin = await findAdmin(username);
  if (!admin) {
    return { ok: false, error: "admin not found", statusCode: 404 };
  }

  const token = createToken(admin.id, admin.role, "admin");
  return { ok: true, token, userId: admin.id, role: admin.role };
}
