import type Redis from "ioredis";
import { createRedisClient } from "../dal/redisClient.js";
import type { TokenPayload } from "./tokenAuth.js";

type TokenRevocationStore = Pick<Redis, "get" | "set">;

const key = (jti: string) => `xlb:auth:revoked:${jti}`;
let revocationClient: Redis | null = null;

function getTokenRevocationClient(): Redis {
  if (!revocationClient || revocationClient.status === "end") {
    revocationClient = createRedisClient();
  }
  return revocationClient;
}

export async function closeTokenRevocationClient(): Promise<void> {
  const client = revocationClient;
  revocationClient = null;
  if (!client || client.status === "end") return;
  if (client.status === "wait") {
    client.disconnect();
    return;
  }
  await client.quit();
}

export async function revokeToken(
  payload: TokenPayload,
  store: TokenRevocationStore = getTokenRevocationClient(),
): Promise<void> {
  const remainingSeconds = Math.max(1, payload.exp - Math.floor(Date.now() / 1_000));
  await store.set(key(payload.jti), "1", "EX", remainingSeconds);
}

export async function isTokenRevoked(
  jti: string,
  store: TokenRevocationStore = getTokenRevocationClient(),
): Promise<boolean> {
  return (await store.get(key(jti))) !== null;
}
