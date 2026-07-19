import { type CSSProperties } from "react";
import { RuntimeThemeSurface } from "../components/patterns/index.js";
import type { CustomerTemplateShellProps } from "./templateContracts.ts";

export type CustomerOrderCreateTemplateProps = CustomerTemplateShellProps;

const containerStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255, 250, 240, 0.96), #fffaef)",
  borderRadius: 22,
  padding: 16,
  display: "grid",
  gap: 14,
};

export function CustomerOrderCreateTemplate({ route, cityCode, binding, children, header, actions, style }: CustomerOrderCreateTemplateProps) {
  return (
    <RuntimeThemeSurface binding={binding}>
      <div
        className="customer-order-create-template"
        data-city-code={cityCode}
        data-route={route}
        style={{ ...containerStyle, ...style }}
      >
        {header ? <header style={{ display: "grid", gap: 6 }}>{header}</header> : null}
        {actions ? <div style={{ margin: "-4px 0" }}>{actions}</div> : null}
        {children}
      </div>
    </RuntimeThemeSurface>
  );
}
