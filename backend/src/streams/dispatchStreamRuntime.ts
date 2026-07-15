import {
  dispatchStreamConsumer,
  type DispatchStreamConsumeResult,
  type DispatchStreamConsumer,
  type DispatchStreamHandler,
} from "./dispatchStreamConsumer.js";
import { DEFAULT_DISPATCH_CONSUMER_GROUP } from "./cityStreamNames.js";

export type DispatchStreamRuntimeOptions = {
  cityCodes: string[];
  consumerName: string;
  handler: DispatchStreamHandler;
  groupName?: string;
  idleDelayMs?: number;
  onError?: (error: unknown) => void;
};

function add(left: DispatchStreamConsumeResult, right: DispatchStreamConsumeResult) {
  return {
    received: left.received + right.received,
    acknowledged: left.acknowledged + right.acknowledged,
    retryPending: left.retryPending + right.retryPending,
    deadLettered: left.deadLettered + right.deadLettered,
    persistenceBlocked: left.persistenceBlocked + right.persistenceBlocked,
  };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/** Worker-agnostic start/stop runtime; 2C-1 owns final Job Worker wiring. */
export class DispatchStreamRuntime {
  private abortController: AbortController | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly consumer: DispatchStreamConsumer = dispatchStreamConsumer) {}

  async runOnce(options: DispatchStreamRuntimeOptions): Promise<DispatchStreamConsumeResult> {
    const groupName = options.groupName ?? DEFAULT_DISPATCH_CONSUMER_GROUP;
    let total: DispatchStreamConsumeResult = {
      received: 0,
      acknowledged: 0,
      retryPending: 0,
      deadLettered: 0,
      persistenceBlocked: 0,
    };
    for (const cityCode of [...new Set(options.cityCodes)]) {
      const reclaimed = await this.consumer.reclaimStale({
        cityCode, groupName, consumerName: options.consumerName,
        handler: options.handler, count: 25,
      });
      const fresh = await this.consumer.consumeNew({
        cityCode, groupName, consumerName: options.consumerName,
        handler: options.handler, count: 25, blockMs: 0,
      });
      total = add(total, add(reclaimed, fresh));
    }
    return total;
  }

  start(options: DispatchStreamRuntimeOptions): void {
    if (this.running) throw new Error("dispatch stream runtime is already running");
    if (options.cityCodes.length === 0) throw new Error("dispatch stream runtime requires city codes");
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const idleDelayMs = Math.max(50, Math.min(30_000, options.idleDelayMs ?? 1_000));
    this.running = (async () => {
      while (!signal.aborted) {
        try {
          await this.runOnce(options);
        } catch (error) {
          options.onError?.(error);
        }
        await wait(idleDelayMs, signal);
      }
    })().finally(() => {
      this.running = null;
      this.abortController = null;
    });
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    await this.running;
  }

  isRunning(): boolean {
    return this.running !== null;
  }
}

export const dispatchStreamRuntime = new DispatchStreamRuntime();
