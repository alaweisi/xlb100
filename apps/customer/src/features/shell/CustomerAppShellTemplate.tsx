import type { ReactNode } from "react";
import type { CustomerL1TemplateProps } from "../../platform/slices/index.js";
import type { CustomerAppShellActionController } from "./CustomerAppShellActionController.js";
import type { CustomerAppShellState } from "./CustomerAppShellCoordinator.js";
import {
  CUSTOMER_SHELL_COMPONENT_PLAN,
  createCustomerShellComponentRegistry,
} from "./createCustomerShellComponentRegistry.js";
import "./customer-entry.css";

export interface CustomerAppShellTemplateRuntime {
  readonly view: CustomerAppShellState;
  readonly actions: CustomerAppShellActionController;
  readonly children?: ReactNode;
}

export interface CustomerAppShellTemplateProps extends CustomerL1TemplateProps {
  readonly runtime?: CustomerAppShellTemplateRuntime;
}

const shellComponents = createCustomerShellComponentRegistry();

export function CustomerAppShellTemplate({
  runtime,
}: CustomerAppShellTemplateProps) {
  if (runtime === undefined) {
    return (
      <main className="xlb-entry-shell">
        <section className="xlb-entry-surface" role="alert">
          应用入口尚未装配。
        </section>
      </main>
    );
  }
  return (
    <main
      className="xlb-entry-shell"
      data-shell-state={runtime.view.status}
      aria-busy={runtime.view.status !== "ready" || undefined}
    >
      <section className="xlb-entry-surface">
        {CUSTOMER_SHELL_COMPONENT_PLAN.map((type) => {
          const Component = shellComponents.resolve(type);
          return Component === null
            ? null
            : <Component key={type} {...runtime} />;
        })}
      </section>
    </main>
  );
}
