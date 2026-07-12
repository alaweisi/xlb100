import { describe, expect, it } from "vitest";
import {
  sendSupportMessageRequestSchema,
  supportConversationSchema,
  supportRealtimeClientFrameSchema,
  supportRealtimeTicketResponseSchema,
} from "@xlb/validators";

describe("Phase 24D realtime contract", () => {
  it("accepts a valid city-scoped conversation", () => {
    expect(supportConversationSchema.parse({
      conversationId: "conv-1", cityCode: "sz", source: "customer", requesterId: "c-1",
      businessClientId: null, status: "queueing", assignedAgentId: null, linkedTicketId: null,
      lastServerSeq: 0, version: 1, startedAt: "2026-07-12T00:00:00.000Z",
      acceptedAt: null, transferredAt: null, closedAt: null,
      createdAt: "2026-07-12T00:00:00.000Z", updatedAt: "2026-07-12T00:00:00.000Z",
    }).conversationId).toBe("conv-1");
  });

  it("enforces text/image exclusivity and strict input", () => {
    expect(() => sendSupportMessageRequestSchema.parse({ clientMessageId: "client-msg-1", messageType: "text", mediaAssetId: "asset-1", idempotencyKey: "idem-msg-1" })).toThrow();
    expect(() => sendSupportMessageRequestSchema.parse({ clientMessageId: "client-msg-1", messageType: "text", textContent: "hello", idempotencyKey: "idem-msg-1", cityCode: "sz" })).toThrow();
  });

  it("fixes protocol version and bounds one-time ticket shape", () => {
    expect(() => supportRealtimeClientFrameSchema.parse({ type: "ping", protocolVersion: 2, requestId: "request-1" })).toThrow();
    expect(supportRealtimeTicketResponseSchema.parse({ ok: true, ticket: "x".repeat(43), expiresAt: "2026-07-12T00:01:00.000Z" }).ok).toBe(true);
  });
});
