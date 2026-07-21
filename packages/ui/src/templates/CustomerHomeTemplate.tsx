import { type CSSProperties } from "react";
import { RuntimeThemeSurface } from "../components/patterns/index.js";
import type { CustomerTemplateShellProps } from "./templateContracts.ts";

export type CustomerHomeTemplateProps = CustomerTemplateShellProps;

const containerStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255, 250, 240, 0.96), #fffaef)",
  borderRadius: 22,
  padding: 16,
  display: "grid",
  gap: 14,
};

export function CustomerHomeTemplate({ route, cityCode, binding, children, header, actions, style }: CustomerHomeTemplateProps) {
  const cityLabel = cityCode === "hangzhou" ? "杭州" : cityCode === "shanghai" ? "上海" : cityCode === "beijing" ? "北京" : cityCode;
  const routeLabel = route === "/customer/" ? "顾客首页" : "顾客服务画面";
  return (
    <RuntimeThemeSurface binding={binding}>
      <div className="customer-template-frame" data-route={route} style={{ ...containerStyle, ...style }}>
        {header ? <header style={{ display: "grid", gap: 6 }}>{header}</header> : null}
        <div className="customer-template-context" style={{ color: "#6b7280", fontSize: 12 }}>{`当前画面：${routeLabel} · 服务城市：${cityLabel}`}</div>
        {actions ? <div style={{ margin: "-4px 0" }}>{actions}</div> : null}
        {children}
      </div>
    </RuntimeThemeSurface>
  );
}
