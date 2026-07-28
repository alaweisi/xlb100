import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";

const viteEnv = (
  import.meta as ImportMeta & {
    env?: {
      VITE_APP_VERSION?: string;
      VITE_DEMO_SESSION_TTL_SECONDS?: string;
      VITE_MOBILE_API_ORIGIN?: string;
      VITE_MOBILE_BUILD_PROFILE?: string;
      VITE_MOBILE_SOURCE_COMMIT?: string;
    };
  }
).env;

export const IS_ADMIN_INVESTOR_DEMO =
  viteEnv?.VITE_MOBILE_BUILD_PROFILE === "investor-demo";
export const ADMIN_INVESTOR_DEMO_USERNAME =
  INVESTOR_DEMO_IDENTITIES.admin.username;
export const ADMIN_INVESTOR_DEMO_CITY_CODE =
  INVESTOR_DEMO_IDENTITIES.cityCode;
export const ADMIN_DEMO_SESSION_TTL_MS = Math.max(
  60,
  Number(viteEnv?.VITE_DEMO_SESSION_TTL_SECONDS ?? "1800") || 1_800,
) * 1_000;

export const adminInvestorDemoInfo = Object.freeze({
  version: viteEnv?.VITE_APP_VERSION ?? "development",
  environment: IS_ADMIN_INVESTOR_DEMO ? "腾讯云 Staging · Investor Demo" : "工程环境",
  sourceCommit: viteEnv?.VITE_MOBILE_SOURCE_COMMIT ?? "local-unbound",
  apiOrigin: viteEnv?.VITE_MOBILE_API_ORIGIN ?? "由当前工程配置决定",
});

export function adminDemoCityLabel(cityCode?: string): string {
  if (!cityCode) return IS_ADMIN_INVESTOR_DEMO ? "杭州演示区" : "-";
  if (!IS_ADMIN_INVESTOR_DEMO) return cityCode;
  const labels: Record<string, string> = {
    beijing: "北京演示区",
    hangzhou: "杭州演示区",
    shanghai: "上海演示区",
  };
  return labels[cityCode] ?? "演示服务区";
}

export function AdminInvestorDemoNotice() {
  if (!IS_ADMIN_INVESTOR_DEMO) return null;
  return (
    <aside
      aria-label="演示环境声明"
      style={{
        background: "#f4eeff",
        border: "2px solid #7d5db8",
        borderRadius: 12,
        color: "#3e2772",
        display: "grid",
        gap: 8,
        padding: "12px 14px",
      }}
    >
      <strong>Investor Demo · 管理端演示</strong>
      <span>仅供模拟演示，支付、短信、地图均为模拟，不得录入真实个人或支付信息。</span>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>应用信息</summary>
        <dl style={{ display: "grid", gap: 4, margin: "8px 0 0" }}>
          <div><dt style={{ display: "inline", fontWeight: 700 }}>版本：</dt><dd style={{ display: "inline", margin: 0 }}>{adminInvestorDemoInfo.version}</dd></div>
          <div><dt style={{ display: "inline", fontWeight: 700 }}>环境：</dt><dd style={{ display: "inline", margin: 0 }}>{adminInvestorDemoInfo.environment}</dd></div>
          <div><dt style={{ display: "inline", fontWeight: 700 }}>源码：</dt><dd style={{ display: "inline", margin: 0 }}>{adminInvestorDemoInfo.sourceCommit}</dd></div>
        </dl>
      </details>
    </aside>
  );
}
