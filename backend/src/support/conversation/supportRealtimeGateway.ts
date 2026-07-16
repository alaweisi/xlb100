import type {
  RequestContext,
  SupportRealtimeClientFrame,
} from "@xlb/types";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import {
  getSupportRedisPublisher,
  getSupportRedisSubscriber,
} from "../../dal/redisClient.js";
import {
  consumeRealtimeTicket,
  type RealtimeIdentity,
} from "./supportRealtimeTicket.js";
import { supportConversationService } from "./supportConversationService.js";

type Client = {
  socket: WebSocket;
  identity: RealtimeIdentity | null;
  subscriptions: Set<string>;
};

type PublishedMessage = {
  cityCode: string;
  conversationId: string;
  messageId: string;
  serverSeq: number;
};

const channel = (city: string, id: string) => `xlb:support:conversation:${city}:${id}`;

function parsePublishedMessage(message: string): PublishedMessage | null {
  try {
    return JSON.parse(message) as PublishedMessage;
  } catch {
    return null;
  }
}

function requestContext(identity: RealtimeIdentity, requestId: string): RequestContext {
  return {
    ...identity,
    traceId: requestId,
    requestId,
    requestStartedAt: new Date().toISOString(),
  };
}

function parseClientFrame(raw: WebSocket.RawData): SupportRealtimeClientFrame {
  return JSON.parse(raw.toString()) as SupportRealtimeClientFrame;
}

export async function registerSupportRealtimeGateway(app: FastifyInstance) {
  const clients = new Set<Client>();
  const subscriber = getSupportRedisSubscriber();
  let subscriberReady: Promise<void> | null = null;

  const handlePublishedMessage = (_pattern: string, _channel: string, message: string) => {
    const payload = parsePublishedMessage(message);
    if (!payload) return;
    for (const client of clients) {
      if (
        client.identity?.cityCode === payload.cityCode
        && client.subscriptions.has(payload.conversationId)
        && client.socket.readyState === 1
      ) {
        client.socket.send(JSON.stringify({
          protocolVersion: 1,
          type: "message_created",
          ...payload,
        }));
      }
    }
  };
  subscriber.on("pmessage", handlePublishedMessage);

  const ensureSubscriber = () => subscriberReady ??= (async () => {
    if (subscriber.status === "wait") await subscriber.connect();
    await subscriber.psubscribe("xlb:support:conversation:*");
  })();

  app.get("/api/support/realtime", { websocket: true }, (socket, request) => {
    const client: Client = { socket, identity: null, subscriptions: new Set() };
    clients.add(client);
    const ticket = String((request.query as { ticket?: string }).ticket ?? "");
    const auth = consumeRealtimeTicket(ticket)
      .then(async (identity) => {
        if (!identity) {
          socket.close(1008, "invalid ticket");
          return null;
        }
        await ensureSubscriber();
        client.identity = identity;
        socket.send(JSON.stringify({
          protocolVersion: 1,
          type: "ready",
          connectionId: request.id,
          serverTime: new Date().toISOString(),
        }));
        return identity;
      })
      .catch(() => {
        socket.close(1011, "ticket service unavailable");
        return null;
      });

    socket.on("message", async (raw) => {
      try {
        const identity = await auth;
        if (!identity) return;
        const frame = parseClientFrame(raw);
        const context = requestContext(identity, request.id);

        if (frame.type === "subscribe") {
          const messages = await supportConversationService.messages(
            context,
            frame.conversationId,
            Number(frame.afterSeq ?? 0),
            100,
          );
          client.subscriptions.add(frame.conversationId);
          socket.send(JSON.stringify({
            protocolVersion: 1,
            type: "catchup",
            requestId: frame.requestId,
            conversationId: frame.conversationId,
            messages,
            hasMore: messages.length === 100,
          }));
          return;
        }

        if (frame.type === "send_message") {
          const message = await supportConversationService.send(
            context,
            frame.conversationId,
            frame,
          );
          const publisher = getSupportRedisPublisher();
          if (publisher.status === "wait") await publisher.connect();
          await publisher.publish(
            channel(identity.cityCode, frame.conversationId),
            JSON.stringify({
              cityCode: identity.cityCode,
              conversationId: frame.conversationId,
              messageId: message.messageId,
              serverSeq: message.serverSeq,
            }),
          );
          socket.send(JSON.stringify({
            protocolVersion: 1,
            type: "message_ack",
            requestId: frame.requestId,
            message,
          }));
          return;
        }

        if (frame.type === "ping") {
          socket.send(JSON.stringify({
            protocolVersion: 1,
            type: "pong",
            requestId: frame.requestId,
          }));
        } else {
          throw new Error("unknown frame");
        }
      } catch (error) {
        socket.send(JSON.stringify({
          protocolVersion: 1,
          type: "error",
          error: error instanceof Error ? error.message : "invalid frame",
        }));
      }
    });
    socket.on("close", () => clients.delete(client));
  });

  app.addHook("onClose", async () => {
    // The Redis subscriber is a process-wide singleton. Each Fastify instance
    // owns only its listener, so remove exactly that listener without issuing
    // PUNSUBSCRIBE and disrupting another live app instance.
    subscriber.off("pmessage", handlePublishedMessage);
    for (const client of clients) client.socket.close(1001, "server shutdown");
    clients.clear();
  });
}
