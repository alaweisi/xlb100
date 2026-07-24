import type { ComponentType } from "react";
import type {
  CustomerSduiActionDefinition,
  CustomerSduiActionKey,
  CustomerSduiComponentContractVersion,
  CustomerSduiComponentInstance,
  CustomerSduiComponentRegion,
  CustomerSduiComponentType,
  CustomerSduiDataKey,
  CustomerSduiDataSource,
  CustomerSduiPageManifest,
} from "@xlb/types";

export type HomeComponentInstanceOf<TType extends CustomerSduiComponentType> = Extract<
  CustomerSduiComponentInstance,
  { type: TType }
>;

export interface HomeBoundAction {
  readonly definition: CustomerSduiActionDefinition;
  invoke(payload?: unknown): void | Promise<void>;
}

export interface HomeComponentRuntimeProps<
  TType extends CustomerSduiComponentType = CustomerSduiComponentType,
> {
  readonly instance: HomeComponentInstanceOf<TType>;
  readonly data: Readonly<Record<string, unknown>>;
  readonly actions: Readonly<Record<string, HomeBoundAction>>;
}

export interface HomeDataSlotCapability {
  readonly slot: string;
  readonly dataKeys: readonly CustomerSduiDataKey[];
  readonly required: boolean;
}

export interface HomeActionSlotCapability {
  readonly slot: string;
  readonly actionKeys: readonly CustomerSduiActionKey[];
  readonly required: boolean;
}

export interface HomeComponentDefinition<
  TType extends CustomerSduiComponentType = CustomerSduiComponentType,
> {
  readonly type: TType;
  readonly region: HomeComponentInstanceOf<TType>["region"];
  readonly supportedContractVersions: readonly CustomerSduiComponentContractVersion[];
  readonly dataSlots: readonly HomeDataSlotCapability[];
  readonly actionSlots: readonly HomeActionSlotCapability[];
  readonly component: ComponentType<HomeComponentRuntimeProps<TType>>;
}

export interface HomeResolvedDataBinding {
  readonly slot: string;
  readonly source: CustomerSduiDataSource;
  readonly required: boolean;
}

export interface HomeResolvedActionBinding {
  readonly slot: string;
  readonly action: CustomerSduiActionDefinition;
}

export interface HomeCompositionNode {
  readonly instance: CustomerSduiComponentInstance;
  readonly definition: HomeComponentDefinition;
  readonly dataBindings: readonly HomeResolvedDataBinding[];
  readonly actionBindings: readonly HomeResolvedActionBinding[];
}

export const HOME_COMPOSITION_ISSUE_CODES = [
  "manifest_contract_unsupported",
  "component_unregistered",
  "component_contract_unsupported",
  "component_contract_mismatch",
  "component_region_mismatch",
  "data_slot_unsupported",
  "data_reference_unresolved",
  "data_key_unsupported",
  "required_data_missing",
  "required_data_marked_optional",
  "action_slot_unsupported",
  "action_reference_unresolved",
  "action_key_unsupported",
  "action_handler_unregistered",
  "required_action_missing",
  "protected_component_unavailable",
  "content_component_unavailable",
] as const;

export type HomeCompositionIssueCode = typeof HOME_COMPOSITION_ISSUE_CODES[number];
export type HomeCompositionIssueSeverity = "warning" | "fatal";

export interface HomeCompositionIssue {
  readonly code: HomeCompositionIssueCode;
  readonly severity: HomeCompositionIssueSeverity;
  readonly componentId: string | null;
  readonly componentType: CustomerSduiComponentType | null;
  readonly slot: string | null;
  readonly message: string;
}

export type HomeCompositionStatus = "ready" | "degraded" | "rejected";

export interface HomeCompositionResult {
  readonly status: HomeCompositionStatus;
  readonly pageId: CustomerSduiPageManifest["pageId"];
  readonly manifestId: string;
  readonly revision: string;
  readonly nodes: readonly HomeCompositionNode[];
  readonly issues: readonly HomeCompositionIssue[];
}

export interface HomeComponentRuntimeBindings {
  readonly data: Readonly<Record<string, unknown>>;
  readonly actions: Readonly<Record<string, HomeBoundAction>>;
}

export type HomeRuntimeBindingsResolver = (
  node: HomeCompositionNode,
) => HomeComponentRuntimeBindings;

export interface HomeActionInvocation {
  readonly definition: CustomerSduiActionDefinition;
  readonly sourceComponentId: string;
  readonly sourceComponentType?: CustomerSduiComponentType;
  readonly sourceComponentRegion?: CustomerSduiComponentRegion;
  readonly sourceComponentOrder?: number;
  readonly payload?: unknown;
}

export type HomeActionHandler = (
  invocation: HomeActionInvocation,
) => void | Promise<void>;

export interface HomeComponentRenderError {
  readonly node: HomeCompositionNode;
  readonly error: Error;
}

export const HOME_REGION_ORDER: Readonly<Record<CustomerSduiComponentRegion, number>> = {
  header: 0,
  content: 1,
  footer: 2,
};
