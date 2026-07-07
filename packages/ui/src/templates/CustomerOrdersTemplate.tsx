import { type CSSProperties } from "react";
import { RuntimeThemeSurface } from "../components/patterns/index.js";
import type { CustomerTemplateShellProps } from "./templateContracts.ts";

export type CustomerOrdersTemplateProps = CustomerTemplateShellProps;

const containerStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255, 250, 240, 0.96), #fffaef)",
  borderRadius: 22,
  padding: 16,
  display: "grid",
  gap: 14,
};

export function CustomerOrdersTemplate({ route, cityCode, binding, children, header, actions, style }: CustomerOrdersTemplateProps) {
  return (
    <RuntimeThemeSurface binding={binding}>
      <div style={{ ...containerStyle, ...style }}>
        {header ? <header style={{ display: "grid", gap: 6 }}>{header}</header> : null}
        <div style={{ color: "#6b7280", fontSize: 12 }}>{`${route} / ${cityCode}`}</div>
        {actions ? <div style={{ margin: "-4px 0" }}>{actions}</div> : null}
        {children}
      </div>
    </RuntimeThemeSurface>
  );
}
