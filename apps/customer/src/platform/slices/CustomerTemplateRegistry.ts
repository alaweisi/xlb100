import type { CustomerSduiPageManifest } from "@xlb/types";
import type { ComponentType } from "react";
import type {
  CustomerRoutePattern,
  CustomerSliceDefinition,
  CustomerTemplateId,
} from "./CustomerSliceDefinition.js";
import type { CustomerSliceState } from "./sliceState.js";

export interface CustomerTemplateRouteContext {
  readonly pathname: string;
  readonly pattern: CustomerRoutePattern;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
}

interface CustomerTemplateBaseProps {
  readonly slice: CustomerSliceDefinition;
  readonly route: CustomerTemplateRouteContext;
  readonly state: CustomerSliceState;
}

/**
 * L1 templates have no operational Manifest prop by design. Business flow,
 * component order, amounts and state decisions remain application-owned.
 */
export interface CustomerL1TemplateProps extends CustomerTemplateBaseProps {
  readonly operationalManifest?: never;
}

export interface CustomerL2TemplateProps extends CustomerTemplateBaseProps {
  /** Must be validated by the owning feature as a presentation-only plan. */
  readonly operationalManifest: unknown | null;
}

export interface CustomerL3TemplateProps extends CustomerTemplateBaseProps {
  readonly operationalManifest: CustomerSduiPageManifest | null;
}

export type CustomerTemplateRegistration =
  | {
      readonly templateId: CustomerTemplateId;
      readonly orchestrationLevel: "L1";
      readonly operationalManifest: "forbidden";
      readonly component: ComponentType<CustomerL1TemplateProps>;
    }
  | {
      readonly templateId: CustomerTemplateId;
      readonly orchestrationLevel: "L2";
      readonly operationalManifest: "limited";
      readonly component: ComponentType<CustomerL2TemplateProps>;
    }
  | {
      readonly templateId: CustomerTemplateId;
      readonly orchestrationLevel: "L3";
      readonly operationalManifest: "sdui";
      readonly component: ComponentType<CustomerL3TemplateProps>;
    };

function assertRegistrationPolicy(registration: CustomerTemplateRegistration): void {
  const candidate = registration as {
    readonly orchestrationLevel: string;
    readonly operationalManifest: string;
  };
  const expected = candidate.orchestrationLevel === "L1"
    ? "forbidden"
    : candidate.orchestrationLevel === "L2"
      ? "limited"
      : candidate.orchestrationLevel === "L3"
        ? "sdui"
        : null;

  if (expected === null || candidate.operationalManifest !== expected) {
    throw new Error(
      `Customer template ${registration.templateId} has an invalid orchestration policy`,
    );
  }
}

export class CustomerTemplateRegistry {
  readonly #registrations = new Map<CustomerTemplateId, CustomerTemplateRegistration>();
  #sealed = false;

  register(registration: CustomerTemplateRegistration): this {
    if (this.#sealed) {
      throw new Error("Customer template registry is sealed");
    }
    if (this.#registrations.has(registration.templateId)) {
      throw new Error(`Customer template is already registered: ${registration.templateId}`);
    }
    assertRegistrationPolicy(registration);
    this.#registrations.set(registration.templateId, Object.freeze({ ...registration }));
    return this;
  }

  seal(): this {
    this.#sealed = true;
    return this;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  resolve(templateId: CustomerTemplateId): CustomerTemplateRegistration | null {
    return this.#registrations.get(templateId) ?? null;
  }

  resolveForSlice(slice: CustomerSliceDefinition): CustomerTemplateRegistration | null {
    const registration = this.resolve(slice.templateId);
    if (registration === null) return null;
    if (registration.orchestrationLevel !== slice.orchestration.level) {
      throw new Error(
        `Customer slice ${slice.id} and template ${slice.templateId} use different orchestration levels`,
      );
    }
    return registration;
  }

  list(): readonly CustomerTemplateId[] {
    return Object.freeze([...this.#registrations.keys()]);
  }
}
