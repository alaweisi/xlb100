import type {
  CustomerSduiActionDefinition,
  CustomerSduiComponentInstance,
  CustomerSduiComponentType,
  CustomerSduiDataSource,
  CustomerSduiPageManifest,
} from "@xlb/types";
import type { HomeActionRegistry } from "../actions/HomeActionRegistry.js";
import type { HomeComponentRegistry } from "./HomeComponentRegistry.js";
import {
  HOME_REGION_ORDER,
  type HomeCompositionIssue,
  type HomeCompositionNode,
  type HomeCompositionResult,
  type HomeComponentDefinition,
  type HomeResolvedActionBinding,
  type HomeResolvedDataBinding,
} from "./homeCompositionTypes.js";

const PROTECTED_HOME_COMPONENT_TYPES: readonly CustomerSduiComponentType[] = [
  "location_header",
  "search_bar",
  "bottom_navigation",
];

function issue(
  partial: Omit<HomeCompositionIssue, "slot" | "componentId" | "componentType"> &
    Partial<Pick<HomeCompositionIssue, "slot" | "componentId" | "componentType">>,
): HomeCompositionIssue {
  return Object.freeze({
    slot: null,
    componentId: null,
    componentType: null,
    ...partial,
  });
}

function sortComponents(
  components: readonly CustomerSduiComponentInstance[],
): CustomerSduiComponentInstance[] {
  return [...components].sort((left, right) =>
    HOME_REGION_ORDER[left.region] - HOME_REGION_ORDER[right.region] ||
    left.order - right.order ||
    left.id.localeCompare(right.id),
  );
}

interface BindingResolution {
  readonly dataBindings: readonly HomeResolvedDataBinding[];
  readonly actionBindings: readonly HomeResolvedActionBinding[];
}

/**
 * Converts an already schema-validated manifest into a renderable, capability-
 * checked component plan. Raw JSON validation remains exclusively owned by
 * @xlb/validators and must happen before this engine is called.
 */
export class HomeCompositionEngine {
  constructor(
    private readonly componentRegistry: HomeComponentRegistry,
    private readonly actionRegistry: HomeActionRegistry,
  ) {
    if (!componentRegistry.sealed) {
      throw new Error("Home component registry must be sealed before composition");
    }
    if (!actionRegistry.sealed) {
      throw new Error("Home action registry must be sealed before composition");
    }
  }

  compose(manifest: CustomerSduiPageManifest): HomeCompositionResult {
    const issues: HomeCompositionIssue[] = [];
    const nodes: HomeCompositionNode[] = [];

    if (manifest.schemaVersion !== "1.0" || manifest.componentContractVersion !== "1.0") {
      issues.push(issue({
        code: "manifest_contract_unsupported",
        severity: "fatal",
        message: `Unsupported Customer SDUI contract ${manifest.schemaVersion}/${manifest.componentContractVersion}`,
      }));
    }

    const dataSources = new Map<string, CustomerSduiDataSource>(
      manifest.dataSources.map((source) => [source.id, Object.freeze({
        ...source,
        parameters: Object.freeze({ ...source.parameters }),
      }) as CustomerSduiDataSource]),
    );
    const actions = new Map<string, CustomerSduiActionDefinition>(
      manifest.actions.map((action) => [action.id, Object.freeze({ ...action })]),
    );

    for (const component of sortComponents(manifest.components)) {
      if (!component.enabled) continue;

      const definition = this.componentRegistry.resolve(component.type);
      if (definition === null) {
        issues.push(issue({
          code: "component_unregistered",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          message: `Component ${component.type} is not bundled in this customer app`,
        }));
        continue;
      }

      const componentIssues = this.checkComponent(
        component,
        definition,
        manifest.componentContractVersion,
        dataSources,
        actions,
      );
      issues.push(...componentIssues);
      if (componentIssues.length > 0) continue;

      const bindings = this.resolveBindings(component, dataSources, actions);
      nodes.push(Object.freeze({
        instance: this.snapshotComponent(component),
        definition: definition as HomeComponentDefinition,
        dataBindings: Object.freeze(bindings.dataBindings),
        actionBindings: Object.freeze(bindings.actionBindings),
      }));
    }

    for (const protectedType of PROTECTED_HOME_COMPONENT_TYPES) {
      if (!nodes.some((node) => node.instance.type === protectedType)) {
        issues.push(issue({
          code: "protected_component_unavailable",
          severity: "fatal",
          componentType: protectedType,
          message: `Protected home component is unavailable: ${protectedType}`,
        }));
      }
    }

    if (!nodes.some((node) => node.instance.region === "content")) {
      issues.push(issue({
        code: "content_component_unavailable",
        severity: "fatal",
        message: "No safe content component remains after capability checks",
      }));
    }

    const status = issues.some((item) => item.severity === "fatal")
      ? "rejected"
      : issues.length > 0
        ? "degraded"
        : "ready";

    return Object.freeze({
      status,
      pageId: manifest.pageId,
      manifestId: manifest.manifestId,
      revision: manifest.revision,
      nodes: Object.freeze(nodes),
      issues: Object.freeze(issues),
    });
  }

  private checkComponent(
    component: CustomerSduiComponentInstance,
    definition: HomeComponentDefinition,
    manifestContractVersion: CustomerSduiPageManifest["componentContractVersion"],
    dataSources: ReadonlyMap<string, CustomerSduiDataSource>,
    actions: ReadonlyMap<string, CustomerSduiActionDefinition>,
  ): HomeCompositionIssue[] {
    const issues: HomeCompositionIssue[] = [];

    if (!definition.supportedContractVersions.includes(component.contractVersion)) {
      issues.push(issue({
        code: "component_contract_unsupported",
        severity: "warning",
        componentId: component.id,
        componentType: component.type,
        message: `Component ${component.type} does not support contract ${component.contractVersion}`,
      }));
    }
    if (component.contractVersion !== manifestContractVersion) {
      issues.push(issue({
        code: "component_contract_mismatch",
        severity: "warning",
        componentId: component.id,
        componentType: component.type,
        message: `Component ${component.type} contract does not match the manifest contract`,
      }));
    }
    if (definition.region !== component.region) {
      issues.push(issue({
        code: "component_region_mismatch",
        severity: "warning",
        componentId: component.id,
        componentType: component.type,
        message: `Component ${component.type} cannot render in region ${component.region}`,
      }));
    }

    for (const binding of component.dataBindings) {
      const capability = definition.dataSlots.find((item) => item.slot === binding.slot);
      const source = dataSources.get(binding.dataRef);
      if (capability === undefined) {
        issues.push(issue({
          code: "data_slot_unsupported",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Component ${component.type} does not allow data slot ${binding.slot}`,
        }));
      } else if (source === undefined) {
        issues.push(issue({
          code: "data_reference_unresolved",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Data reference is unavailable: ${binding.dataRef}`,
        }));
      } else if (!capability.dataKeys.includes(source.dataKey)) {
        issues.push(issue({
          code: "data_key_unsupported",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Data key ${source.dataKey} is not allowed for ${component.type}.${binding.slot}`,
        }));
      } else if (capability.required && !binding.required) {
        issues.push(issue({
          code: "required_data_marked_optional",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Required data slot ${component.type}.${binding.slot} cannot be optional`,
        }));
      }
    }

    for (const capability of definition.dataSlots) {
      if (capability.required && !component.dataBindings.some((binding) => binding.slot === capability.slot)) {
        issues.push(issue({
          code: "required_data_missing",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: capability.slot,
          message: `Required data slot is missing: ${component.type}.${capability.slot}`,
        }));
      }
    }

    for (const binding of component.actionBindings) {
      const capability = definition.actionSlots.find((item) => item.slot === binding.slot);
      const action = actions.get(binding.actionRef);
      if (capability === undefined) {
        issues.push(issue({
          code: "action_slot_unsupported",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Component ${component.type} does not allow action slot ${binding.slot}`,
        }));
      } else if (action === undefined) {
        issues.push(issue({
          code: "action_reference_unresolved",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Action reference is unavailable: ${binding.actionRef}`,
        }));
      } else if (!capability.actionKeys.includes(action.actionKey)) {
        issues.push(issue({
          code: "action_key_unsupported",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Action ${action.actionKey} is not allowed for ${component.type}.${binding.slot}`,
        }));
      } else if (action !== undefined && !this.actionRegistry.has(action.actionKey)) {
        issues.push(issue({
          code: "action_handler_unregistered",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: binding.slot,
          message: `Application action handler is unavailable: ${action.actionKey}`,
        }));
      }
    }

    for (const capability of definition.actionSlots) {
      if (capability.required && !component.actionBindings.some((binding) => binding.slot === capability.slot)) {
        issues.push(issue({
          code: "required_action_missing",
          severity: "warning",
          componentId: component.id,
          componentType: component.type,
          slot: capability.slot,
          message: `Required action slot is missing: ${component.type}.${capability.slot}`,
        }));
      }
    }

    return issues;
  }

  private resolveBindings(
    component: CustomerSduiComponentInstance,
    dataSources: ReadonlyMap<string, CustomerSduiDataSource>,
    actions: ReadonlyMap<string, CustomerSduiActionDefinition>,
  ): BindingResolution {
    const dataBindings = component.dataBindings.flatMap((binding) => {
      const source = dataSources.get(binding.dataRef);
      return source === undefined ? [] : [Object.freeze({
        slot: binding.slot,
        source,
        required: binding.required,
      })];
    });
    const actionBindings = component.actionBindings.flatMap((binding) => {
      const action = actions.get(binding.actionRef);
      return action === undefined ? [] : [Object.freeze({ slot: binding.slot, action })];
    });

    return {
      dataBindings,
      actionBindings,
    };
  }

  private snapshotComponent(
    component: CustomerSduiComponentInstance,
  ): CustomerSduiComponentInstance {
    return Object.freeze({
      ...component,
      props: Object.freeze({ ...component.props }),
      dataBindings: Object.freeze(component.dataBindings.map((binding) => Object.freeze({ ...binding }))),
      actionBindings: Object.freeze(component.actionBindings.map((binding) => Object.freeze({ ...binding }))),
    }) as CustomerSduiComponentInstance;
  }
}
