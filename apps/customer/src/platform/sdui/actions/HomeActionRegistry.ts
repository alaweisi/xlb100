import {
  CUSTOMER_SDUI_ACTION_KEYS,
  type CustomerSduiActionKey,
} from "@xlb/types";
import type {
  HomeActionHandler,
  HomeActionInvocation,
} from "../composition/homeCompositionTypes.js";

const CONTRACT_ACTION_KEYS = new Set<string>(CUSTOMER_SDUI_ACTION_KEYS);

/** Application-owned action-handler allowlist. It never accepts scripts or URLs. */
export class HomeActionRegistry {
  readonly #handlers = new Map<CustomerSduiActionKey, HomeActionHandler>();
  #sealed = false;

  register(actionKey: CustomerSduiActionKey, handler: HomeActionHandler): this {
    if (this.#sealed) {
      throw new Error("Home action registry is sealed");
    }
    if (!CONTRACT_ACTION_KEYS.has(actionKey)) {
      throw new Error(`Home action key is outside the shared contract: ${actionKey}`);
    }
    if (this.#handlers.has(actionKey)) {
      throw new Error(`Home action key already registered: ${actionKey}`);
    }
    this.#handlers.set(actionKey, handler);
    return this;
  }

  seal(): this {
    this.#sealed = true;
    return this;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  has(actionKey: CustomerSduiActionKey): boolean {
    return this.#handlers.has(actionKey);
  }

  resolve(actionKey: CustomerSduiActionKey): HomeActionHandler | null {
    return this.#handlers.get(actionKey) ?? null;
  }

  invoke(actionKey: CustomerSduiActionKey, invocation: HomeActionInvocation): void | Promise<void> {
    if (invocation.definition.actionKey !== actionKey) {
      throw new Error(
        `Home action invocation mismatch: expected ${actionKey}, received ${invocation.definition.actionKey}`,
      );
    }
    const handler = this.resolve(actionKey);
    if (handler === null) {
      throw new Error(`Home action handler is not registered: ${actionKey}`);
    }
    return handler(invocation);
  }

  list(): readonly CustomerSduiActionKey[] {
    return [...this.#handlers.keys()];
  }
}
