import { describe, expect, it } from "vitest";
import type { RequestContext } from "@xlb/types";
import { createToken, verifyToken } from "../../backend/src/auth/tokenAuth.js";
import { canAccessAdminOperation, isOaHeadquartersContext } from "../../backend/src/auth/operationsAuthorization.js";
import { getAllowedRoles } from "../../backend/src/gateway/appTypeGuard.js";

function context(appType: RequestContext["appType"], role: RequestContext["role"]): RequestContext {
  return {
    traceId: "oa-authorization-test",
    appType,
    role,
    cityCode: "hangzhou",
    userId: "oa-headquarters-admin",
    requestStartedAt: "2026-07-20T00:00:00.000Z",
  };
}

describe("OA headquarters authorization", () => {
  it("binds OA tokens exclusively to the admin role", () => {
    const verified = verifyToken(createToken("oa-headquarters-admin", "admin", "oa"));
    expect(verified).toMatchObject({ ok: true, payload: { appType: "oa", role: "admin" } });
    expect(() => createToken("oa-operator", "operator", "oa")).toThrow("invalid subject");
    expect(getAllowedRoles("oa")).toEqual(["admin"]);
    const dashboard = verifyToken(createToken("dashboard-headquarters", "admin", "dashboard"));
    expect(dashboard).toMatchObject({ ok: true, payload: { appType: "dashboard", role: "admin" } });
  });

  it("grants OA headquarters the Admin capability superset without elevating Admin roles", () => {
    const oa = context("oa", "admin");
    expect(isOaHeadquartersContext(oa)).toBe(true);
    expect(canAccessAdminOperation(oa, ["operator"])).toBe(true);
    expect(canAccessAdminOperation(context("admin", "admin"), ["operator"])).toBe(false);
    expect(canAccessAdminOperation(context("admin", "operator"), ["operator"])).toBe(true);
    expect(canAccessAdminOperation(context("dashboard", "admin"))).toBe(false);
  });
});
