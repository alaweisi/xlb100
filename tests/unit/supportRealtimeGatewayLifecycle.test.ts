import { EventEmitter } from "node:events";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSubscriber: vi.fn(),
}));

vi.mock("../../backend/src/dal/redisClient.js", () => ({
  getSupportRedisSubscriber: mocks.getSubscriber,
  getSupportRedisPublisher: vi.fn(),
}));

import { registerSupportRealtimeGateway } from "../../backend/src/support/conversation/supportRealtimeGateway.js";

type CloseHook = () => Promise<void>;

function fakeApp(closeHooks: CloseHook[]): FastifyInstance {
  return {
    get: vi.fn(),
    addHook: vi.fn((name: string, hook: CloseHook) => {
      if (name === "onClose") closeHooks.push(hook);
    }),
  } as unknown as FastifyInstance;
}

describe("support realtime gateway lifecycle", () => {
  const subscriber = new EventEmitter();

  beforeEach(() => {
    subscriber.removeAllListeners();
    mocks.getSubscriber.mockReset().mockReturnValue(subscriber);
  });

  it("removes its process-wide Redis listener whenever an app closes", async () => {
    const baseline = subscriber.listenerCount("pmessage");

    for (let index = 0; index < 12; index += 1) {
      const closeHooks: CloseHook[] = [];
      await registerSupportRealtimeGateway(fakeApp(closeHooks));
      expect(subscriber.listenerCount("pmessage")).toBe(baseline + 1);
      expect(closeHooks).toHaveLength(1);

      await closeHooks[0]!();
      expect(subscriber.listenerCount("pmessage")).toBe(baseline);
    }
  });
});
