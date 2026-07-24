import type { ComponentType } from "react";

export interface CustomerComponentConfig<TType extends string = string, TProps = Record<string, unknown>> {
  id: string;
  type: TType;
  props?: TProps;
  visible?: boolean;
}

export interface CustomerPageConfig<TType extends string = string> {
  page: string;
  revision: string;
  components: ReadonlyArray<CustomerComponentConfig<TType>>;
}

export class CustomerComponentRegistry<TType extends string, TProps extends object = Record<string, unknown>> {
  readonly #components = new Map<TType, ComponentType<TProps>>();

  register(type: TType, component: ComponentType<TProps>): this {
    if (this.#components.has(type)) {
      throw new Error(`Customer component type already registered: ${type}`);
    }
    this.#components.set(type, component);
    return this;
  }

  resolve(type: TType): ComponentType<TProps> | null {
    return this.#components.get(type) ?? null;
  }

  has(type: TType): boolean {
    return this.#components.has(type);
  }

  list(): readonly TType[] {
    return [...this.#components.keys()];
  }
}
