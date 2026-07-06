function normalizeApiBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

const viteEnv = (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env;

export const API_BASE = normalizeApiBase(viteEnv?.VITE_API_BASE);
