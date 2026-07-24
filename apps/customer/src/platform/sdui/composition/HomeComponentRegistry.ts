import type {
  CustomerSduiComponentType,
  CustomerSduiDataKey,
  CustomerSduiActionKey,
} from "@xlb/types";
import type { HomeComponentDefinition } from "./homeCompositionTypes.js";

type StoredHomeComponentDefinition = HomeComponentDefinition<CustomerSduiComponentType>;

function snapshotDefinition<TType extends CustomerSduiComponentType>(
  definition: HomeComponentDefinition<TType>,
): StoredHomeComponentDefinition {
  return Object.freeze({
    ...definition,
    supportedContractVersions: Object.freeze([...definition.supportedContractVersions]),
    dataSlots: Object.freeze(definition.dataSlots.map((item) => Object.freeze({
      ...item,
      dataKeys: Object.freeze([...item.dataKeys]),
    }))),
    actionSlots: Object.freeze(definition.actionSlots.map((item) => Object.freeze({
      ...item,
      actionKeys: Object.freeze([...item.actionKeys]),
    }))),
  }) as unknown as StoredHomeComponentDefinition;
}

function assertUniqueSlots(
  componentType: CustomerSduiComponentType,
  category: "data" | "action",
  slots: readonly { readonly slot: string }[],
): void {
  const seen = new Set<string>();
  for (const item of slots) {
    if (item.slot.length === 0) {
      throw new Error(`Home component ${componentType} has an empty ${category} slot`);
    }
    if (seen.has(item.slot)) {
      throw new Error(`Home component ${componentType} declares duplicate ${category} slot: ${item.slot}`);
    }
    seen.add(item.slot);
  }
}

function assertNonEmptyAllowlist(
  componentType: CustomerSduiComponentType,
  category: "data" | "action",
  slots: readonly {
    readonly slot: string;
    readonly dataKeys?: readonly CustomerSduiDataKey[];
    readonly actionKeys?: readonly CustomerSduiActionKey[];
  }[],
): void {
  for (const item of slots) {
    const values = category === "data" ? item.dataKeys : item.actionKeys;
    if (values === undefined || values.length === 0) {
      throw new Error(
        `Home component ${componentType} ${category} slot ${item.slot} must declare an allowlist`,
      );
    }
  }
}

/**
 * Application-owned home component allowlist.
 *
 * The registry is assembled from bundled components and sealed before the
 * composition engine can consume it. A manifest can select a registered key;
 * it can never register code, replace code, or provide a dynamic import.
 */
export class HomeComponentRegistry {
  readonly #definitions = new Map<CustomerSduiComponentType, StoredHomeComponentDefinition>();
  #sealed = false;

  register<TType extends CustomerSduiComponentType>(
    definition: HomeComponentDefinition<TType>,
  ): this {
    if (this.#sealed) {
      throw new Error("Home component registry is sealed");
    }
    if (this.#definitions.has(definition.type)) {
      throw new Error(`Home component type already registered: ${definition.type}`);
    }
    if (definition.supportedContractVersions.length === 0) {
      throw new Error(`Home component ${definition.type} must support at least one contract version`);
    }

    assertUniqueSlots(definition.type, "data", definition.dataSlots);
    assertUniqueSlots(definition.type, "action", definition.actionSlots);
    assertNonEmptyAllowlist(definition.type, "data", definition.dataSlots);
    assertNonEmptyAllowlist(definition.type, "action", definition.actionSlots);

    this.#definitions.set(definition.type, snapshotDefinition(definition));
    return this;
  }

  seal(): this {
    this.#sealed = true;
    return this;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  resolve<TType extends CustomerSduiComponentType>(
    type: TType,
  ): HomeComponentDefinition<TType> | null {
    return (this.#definitions.get(type) as unknown as HomeComponentDefinition<TType> | undefined) ?? null;
  }

  has(type: CustomerSduiComponentType): boolean {
    return this.#definitions.has(type);
  }

  list(): readonly CustomerSduiComponentType[] {
    return [...this.#definitions.keys()];
  }
}
