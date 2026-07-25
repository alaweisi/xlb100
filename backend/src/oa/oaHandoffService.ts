import { createHash, randomBytes } from "node:crypto";
import type {
  CityCode,
  OaAdminHandoffExchangeResponse,
  OaAdminHandoffResponse,
  OaPermissionKey,
  OaPrincipal,
} from "@xlb/types";
import { getRedisClient } from "../dal/redisClient.js";
import { oaIdentityService } from "./oaIdentityService.js";

const HANDOFF_TTL_SECONDS = 60;
const HANDOFF_PREFIX = "oa:admin-handoff:v1:";

const TARGET_PERMISSIONS = Object.freeze<Record<string, readonly OaPermissionKey[]>>({
  "/admin/#/platform-operations": [
    "operations.orders.read",
    "operations.catalog.read",
    "operations.certification.read",
  ],
  "/admin/#/dispatch": ["operations.dispatch.read"],
  "/admin/#/": ["finance.settlement.read"],
  "/admin/#/worker-withdrawals": ["finance.withdrawal.read"],
  "/admin/#/aftersale": ["aftersale.read"],
  "/admin/#/support": ["support.read"],
  "/admin/#/support-quality": ["support.quality.read"],
  "/admin/#/enterprise": ["enterprise.read"],
  "/admin/#/review-moderation": ["reviews.read"],
  "/admin/#/marketing": ["marketing.read"],
});

interface StoredHandoff {
  sourceSessionId: string;
  membershipId: string;
  targetPath: string;
  cityCode: CityCode;
  issuedAt: string;
}

export class OaHandoffError extends Error {
  constructor(message: string, readonly statusCode: 400 | 401 | 409 | 503) {
    super(message);
    this.name = "OaHandoffError";
  }
}

function ticketKey(ticket: string): string {
  return `${HANDOFF_PREFIX}${createHash("sha256").update(ticket).digest("hex")}`;
}

async function redisReady() {
  const redis = getRedisClient();
  if (redis.status === "wait") await redis.connect();
  return redis;
}

export function assertOaAdminHandoffTarget(
  targetPath: string,
  permissionKey: OaPermissionKey,
): void {
  const allowed = TARGET_PERMISSIONS[targetPath];
  if (!allowed?.includes(permissionKey)) {
    throw new OaHandoffError("OA Admin handoff target does not match the requested permission", 400);
  }
}

export class OaHandoffService {
  async issue(
    principal: OaPrincipal,
    input: { targetPath: string; permissionKey: OaPermissionKey; cityCode: CityCode },
  ): Promise<OaAdminHandoffResponse> {
    assertOaAdminHandoffTarget(input.targetPath, input.permissionKey);
    if (!principal.cityCodes.includes(input.cityCode)) {
      throw new OaHandoffError("OA Admin handoff city is outside the effective scope", 400);
    }
    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1_000);
    const payload: StoredHandoff = {
      sourceSessionId: principal.sessionId,
      membershipId: principal.membershipId,
      targetPath: input.targetPath,
      cityCode: input.cityCode,
      issuedAt: new Date().toISOString(),
    };
    try {
      const redis = await redisReady();
      const stored = await redis.set(
        ticketKey(ticket),
        JSON.stringify(payload),
        "EX",
        HANDOFF_TTL_SECONDS,
        "NX",
      );
      if (stored !== "OK") throw new OaHandoffError("OA Admin handoff collision", 409);
    } catch (error) {
      if (error instanceof OaHandoffError) throw error;
      throw new OaHandoffError("OA Admin handoff service is unavailable", 503);
    }
    return {
      ok: true,
      ticket,
      targetPath: input.targetPath,
      cityCode: input.cityCode,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async exchange(ticket: string, deviceSummary?: string): Promise<OaAdminHandoffExchangeResponse> {
    let serialized: unknown;
    try {
      const redis = await redisReady();
      serialized = await redis.eval(
        "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
        1,
        ticketKey(ticket),
      );
    } catch {
      throw new OaHandoffError("OA Admin handoff service is unavailable", 503);
    }
    if (typeof serialized !== "string") {
      throw new OaHandoffError("OA Admin handoff ticket is invalid or expired", 401);
    }
    let handoff: StoredHandoff;
    try {
      handoff = JSON.parse(serialized) as StoredHandoff;
    } catch {
      throw new OaHandoffError("OA Admin handoff ticket is invalid", 401);
    }
    const profile = await oaIdentityService.findActiveSessionProfile(
      handoff.sourceSessionId,
      handoff.membershipId,
    );
    if (!profile) {
      throw new OaHandoffError("The source OA session is no longer active", 401);
    }
    const session = await oaIdentityService.createSession(
      profile,
      `OA Admin handoff${deviceSummary ? ` · ${deviceSummary}` : ""}`.slice(0, 255),
    );
    return {
      ok: true,
      token: session.token,
      userId: session.userId,
      role: session.legacyRole,
      username: session.username,
      sessionId: session.sessionId,
      membershipId: session.membershipId,
      organizationId: session.organizationId,
      organizationName: session.organizationName,
      organizationType: session.organizationType,
      expiresAt: session.expiresAt,
      targetPath: handoff.targetPath,
      cityCode: handoff.cityCode,
    };
  }
}

export const oaHandoffService = new OaHandoffService();
