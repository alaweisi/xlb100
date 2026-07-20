import { type CSSProperties } from "react";
import { RuntimeThemeSurface } from "../components/patterns/index.js";
import type { CustomerTemplateShellProps } from "./templateContracts.ts";

export type CustomerHomeTemplateProps = CustomerTemplateShellProps;

const containerStyle: CSSProperties = {
  background: "transparent",
  padding: 0,
  display: "grid",
  gap: 16,
};

export function CustomerHomeTemplate({ route, cityCode, binding, children, header, actions, style }: CustomerHomeTemplateProps) {
  return (
    <RuntimeThemeSurface binding={binding}>
      <div className="customer-template-frame" data-city-code={cityCode} data-route={route} style={{ ...containerStyle, ...style }}>
        {header ? <header style={{ display: "grid", gap: 6 }}>{header}</header> : null}
        {actions ? <div style={{ margin: "-4px 0" }}>{actions}</div> : null}
        {children}
      </div>
    </RuntimeThemeSurface>
  );
}
