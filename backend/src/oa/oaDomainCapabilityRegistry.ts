import type { OaPermissionKey, Role } from "@xlb/types";

export type OaDomainAccessRule = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: RegExp;
  permission: OaPermissionKey;
  risk: "read" | "manage" | "review" | "decide";
  internalRole: Extract<Role, "admin" | "operator" | "auditor">;
};

const get = (
  id: string,
  path: RegExp,
  permission: OaPermissionKey,
  internalRole: OaDomainAccessRule["internalRole"] = "auditor",
): OaDomainAccessRule => ({ id, method: "GET", path, permission, risk: "read", internalRole });

const write = (
  id: string,
  method: "POST" | "PATCH" | "DELETE",
  path: RegExp,
  permission: OaPermissionKey,
  risk: Exclude<OaDomainAccessRule["risk"], "read"> = "manage",
  internalRole: OaDomainAccessRule["internalRole"] = "operator",
): OaDomainAccessRule => ({ id, method, path, permission, risk, internalRole });

export const OA_DOMAIN_ACCESS_RULES: readonly OaDomainAccessRule[] = [
  get("orders.list", /^\/api\/internal\/operations\/orders$/u, "operations.orders.read", "operator"),
  get("orders.trace", /^\/api\/internal\/admin\/order-traces\/[^/]+$/u, "operations.orders.read", "operator"),
  get("orders.evidence", /^\/api\/internal\/orders\/[^/]+\/fulfillment-evidence$/u, "operations.orders.read", "operator"),

  get("catalog.list", /^\/api\/internal\/operations\/skus$/u, "operations.catalog.read", "operator"),
  write("catalog.status", "POST", /^\/api\/internal\/operations\/skus\/[^/]+\/status$/u, "operations.catalog.manage"),

  get("certification.list", /^\/api\/admin\/certifications$/u, "operations.certification.read", "operator"),
  write("certification.approve", "POST", /^\/api\/admin\/certifications\/[^/]+\/approve$/u, "operations.certification.decide", "decide"),
  write("certification.reject", "POST", /^\/api\/admin\/certifications\/[^/]+\/reject$/u, "operations.certification.decide", "decide"),

  get("dispatch.board", /^\/api\/internal\/dispatch\/board$/u, "operations.dispatch.read", "operator"),
  write("dispatch.action", "POST", /^\/api\/internal\/dispatch\/(?:match-once|timeout-once)$/u, "operations.dispatch.manage"),

  get(
    "aftersale.read",
    /^\/api\/internal\/aftersale\/(?:reverse-requests|complaints(?:\/[^/]+)?)$/u,
    "aftersale.read",
    "operator",
  ),
  write(
    "aftersale.reverse.manage",
    "POST",
    /^\/api\/internal\/aftersale\/reverse-requests\/[^/]+\/(?:review|apply)$/u,
    "aftersale.manage",
  ),
  write(
    "aftersale.complaint.manage",
    "POST",
    /^\/api\/internal\/aftersale\/complaints\/[^/]+\/(?:triage|resolve|close|notes|repair-orders|liability-decisions|compensation-intents)$/u,
    "aftersale.manage",
  ),
  write(
    "aftersale.compensation.review",
    "POST",
    /^\/api\/internal\/aftersale\/compensation-intents\/[^/]+\/review$/u,
    "aftersale.manage",
    "review",
  ),

  get("enterprise.read", /^\/api\/internal\/enterprise\/.+$/u, "enterprise.read", "operator"),
  write("enterprise.manage", "POST", /^\/api\/internal\/enterprise\/.+$/u, "enterprise.manage"),

  get("withdrawal.read", /^\/api\/internal\/worker-withdrawals(?:\/[^/]+)?$/u, "finance.withdrawal.read", "operator"),
  write("withdrawal.review", "POST", /^\/api\/internal\/worker-withdrawals\/[^/]+\/(?:review|mark-paid)$/u, "finance.withdrawal.review", "review"),

  get(
    "settlement.audit.read",
    /^\/api\/internal\/settlement\/(?:worker-statement-audit(?:\/[^/]+)?|worker-statement-export-audit|worker-statement-review-summary|settlement-audit-summary|reconciliation-gap-scan)$/u,
    "finance.settlement.read",
    "operator",
  ),
  get(
    "settlement.plan.read",
    /^\/api\/internal\/settlement-action-governance\/plans(?:\/[^/]+(?:\/(?:items|audit))?)?$/u,
    "finance.settlement.read",
    "operator",
  ),
  write(
    "settlement.plan.create",
    "POST",
    /^\/api\/internal\/settlement-action-governance\/plans$/u,
    "finance.settlement.review",
    "review",
  ),

  get("support.quality.read", /^\/api\/internal\/support\/quality\/.+$/u, "support.quality.read", "admin"),
  write("support.quality.manage", "POST", /^\/api\/internal\/support\/quality\/.+$/u, "support.quality.manage", "manage", "admin"),
  get("support.read", /^\/api\/internal\/support\/.+$/u, "support.read", "operator"),
  write("support.manage.post", "POST", /^\/api\/internal\/support\/.+$/u, "support.manage"),
  write("support.manage.patch", "PATCH", /^\/api\/internal\/support\/.+$/u, "support.manage"),
  write("support.manage.delete", "DELETE", /^\/api\/internal\/support\/.+$/u, "support.manage"),

  get("reviews.content", /^\/api\/admin\/reviews\/[^/]+\/content$/u, "reviews.moderate", "admin"),
  get("reviews.read", /^\/api\/admin\/(?:reviews|review-appeals)(?:\/.*)?$/u, "reviews.read", "auditor"),
  write("reviews.moderate", "POST", /^\/api\/admin\/(?:reviews|review-appeals)\/.+$/u, "reviews.moderate", "decide", "admin"),

  get("marketing.read", /^\/api\/admin\/marketing\/.+$/u, "marketing.read", "auditor"),
  write("marketing.manage", "POST", /^\/api\/admin\/marketing\/.+$/u, "marketing.manage", "manage", "admin"),
] as const;

for (const rule of OA_DOMAIN_ACCESS_RULES) {
  if (rule.method !== "GET" && rule.permission.endsWith(".read")) {
    throw new Error(`OA domain write rule ${rule.id} cannot use read permission`);
  }
}

export function resolveOaDomainAccessRule(
  method: string,
  path: string,
): OaDomainAccessRule | null {
  return OA_DOMAIN_ACCESS_RULES.find(
    (rule) => rule.method === method && rule.path.test(path),
  ) ?? null;
}
