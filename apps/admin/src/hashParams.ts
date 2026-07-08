// Simple hash query param helpers — zero dependencies

export function parseHashParams(): URLSearchParams {
  const hash = window.location.hash.replace(/^#/, "");
  const q = hash.indexOf("?");
  if (q === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(q + 1));
}

function hashPath(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const q = hash.indexOf("?");
  return q === -1 ? hash : hash.slice(0, q);
}

export function buildHash(path: string, params?: Record<string, string>): string {
  const sp = new URLSearchParams(params || {});
  // Remove empty values
  for (const [k, v] of sp.entries()) { if (!v) sp.delete(k); }
  const qs = sp.toString();
  return qs ? `#${path}?${qs}` : `#${path}`;
}

export function parseView():
  | { page: "dashboard" }
  | { page: "detail"; statementId: string }
  | { page: "orders"; orderId?: string }
  | { page: "exports" }
  | { page: "governance"; subView?: string } {
  const h = hashPath();
  const params = parseHashParams();
  if (h === "/settlement-ops/exports") return { page: "exports" };
  if (h === "/settlement-ops/governance") return { page: "governance", subView: params.get("sub") || undefined };
  const m = h.match(/^\/settlement-ops\/statements\/(.+)$/);
  if (m) return { page: "detail", statementId: decodeURIComponent(m[1]) };
  if (h === "/orders") return { page: "orders", orderId: params.get("orderId") || undefined };
  const orderMatch = h.match(/^\/orders\/(.+)$/);
  if (orderMatch) return { page: "orders", orderId: decodeURIComponent(orderMatch[1]) };
  return { page: "dashboard" };
}
