import type { CustomerL1TemplateProps } from "../../platform/slices/index.js";
import type { CustomerAuthActionController } from "./CustomerAuthActionController.js";
import type { CustomerAuthView } from "./CustomerAuthCoordinator.js";
import {
  CUSTOMER_AUTH_COMPONENT_PLAN,
  createCustomerAuthComponentRegistry,
} from "./createCustomerAuthComponentRegistry.js";
import "../shell/customer-entry.css";

export interface CustomerAuthTemplateRuntime {
  readonly view: CustomerAuthView;
  readonly actions: CustomerAuthActionController;
}

export interface CustomerAuthTemplateProps extends CustomerL1TemplateProps {
  readonly runtime?: CustomerAuthTemplateRuntime;
}

const authComponents = createCustomerAuthComponentRegistry();

export function CustomerAuthTemplate({ runtime }: CustomerAuthTemplateProps) {
  if (runtime === undefined) {
    return (
      <main className="xlb-entry-shell">
        <section className="xlb-entry-status" data-kind="error" role="alert">
          登录入口尚未装配。
        </section>
      </main>
    );
  }
  return (
    <main
      className="xlb-entry-shell"
      data-auth-state={runtime.view.status}
      aria-busy={["requesting-code", "verifying"].includes(runtime.view.status) || undefined}
    >
      <section className="xlb-entry-panel">
        {CUSTOMER_AUTH_COMPONENT_PLAN.map((type) => {
          const Component = authComponents.resolve(type);
          return Component === null ? null : <Component key={type} {...runtime} />;
        })}
      </section>
    </main>
  );
}
