export function normalizeCustomerApiBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

const viteEnv = (
  import.meta as ImportMeta & {
    env?: {
      VITE_API_BASE_URL?: string;
    };
  }
).env;

export const CUSTOMER_API_BASE = normalizeCustomerApiBase(
  viteEnv?.VITE_API_BASE_URL,
);
