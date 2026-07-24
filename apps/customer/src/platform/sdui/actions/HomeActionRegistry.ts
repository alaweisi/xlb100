import {
  CUSTOMER_SDUI_ACTION_KEYS,
  type CustomerSduiActionKey,
} from "@xlb/types";
import type {
  HomeActionHandler,
  HomeActionInvocation,
} from "../composition/homeCompositionTypes.js";

const CONTRACT_ACTION_KEYS = new Set<string>(CUSTOMER_SDUI_ACTION_KEYS);

export type HomeActionRuntimePhase = "invoked" | "succeeded" | "failed" | "rejected";

export interface HomeActionRuntimeEvent {
  readonly actionKey: CustomerSduiActionKey;
  readonly phase: HomeActionRuntimePhase;
  readonly sourceComponentId: string;
  readonly sourceComponentType: HomeActionInvocation["sourceComponentType"];
  readonly sourceComponentRegion: HomeActionInvocation["sourceComponentRegion"];
  readonly sourceComponentOrder: HomeActionInvocation["sourceComponentOrder"];
  readonly durationMs: number | null;
  readonly error?: unknown;
}

export interface HomeActionRegistryOptions {
  readonly onEvent?: (event: HomeActionRuntimeEvent) => void;
  readonly now?: () => number;
}

/** Application-owned action-handler allowlist. It never accepts scripts or URLs. */
export class HomeActionRegistry {
  readonly #handlers = new Map<CustomerSduiActionKey, HomeActionHandler>();
  readonly #onEvent?: HomeActionRegistryOptions["onEvent"];
  readonly #now: () => number;
  #sealed = false;

  constructor(options: HomeActionRegistryOptions = {}) {
    this.#onEvent = options.onEvent;
    this.#now = options.now ?? (() => performance.now());
  }

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
      this.#emit(actionKey, "rejected", invocation, 0);
      throw new Error(
        `Home action invocation mismatch: expected ${actionKey}, received ${invocation.definition.actionKey}`,
      );
    }
    const handler = this.resolve(actionKey);
    if (handler === null) {
      this.#emit(actionKey, "rejected", invocation, 0);
      throw new Error(`Home action handler is not registered: ${actionKey}`);
    }
    const startedAt = this.#now();
    this.#emit(actionKey, "invoked", invocation, null);
    try {
      const result = handler(invocation);
      if (result instanceof Promise) {
        return result.then(
          () => {
            this.#emit(actionKey, "succeeded", invocation, this.#duration(startedAt));
          },
          (error: unknown) => {
            this.#emit(actionKey, "failed", invocation, this.#duration(startedAt), error);
            throw error;
          },
        );
      }
      this.#emit(actionKey, "succeeded", invocation, this.#duration(startedAt));
      return result;
    } catch (error) {
      this.#emit(actionKey, "failed", invocation, this.#duration(startedAt), error);
      throw error;
    }
  }

  list(): readonly CustomerSduiActionKey[] {
    return [...this.#handlers.keys()];
  }

  #duration(startedAt: number): number {
    return Math.max(0, this.#now() - startedAt);
  }

  #emit(
    actionKey: CustomerSduiActionKey,
    phase: HomeActionRuntimePhase,
    invocation: HomeActionInvocation,
    durationMs: number | null,
    error?: unknown,
  ): void {
    try {
      this.#onEvent?.({
        actionKey,
        phase,
        sourceComponentId: invocation.sourceComponentId,
        sourceComponentType: invocation.sourceComponentType,
        sourceComponentRegion: invocation.sourceComponentRegion,
        sourceComponentOrder: invocation.sourceComponentOrder,
        durationMs,
        error,
      });
    } catch {
      // Telemetry cannot alter action dispatch or navigation.
    }
  }
}
