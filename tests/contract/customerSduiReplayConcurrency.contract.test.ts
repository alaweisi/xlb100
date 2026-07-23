import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  MysqlCustomerSduiRepository,
  type CustomerSduiStore,
} from "../../backend/src/customerSdui/customerSduiRepository.js";
import { CustomerSduiError } from "../../backend/src/customerSdui/customerSduiService.js";

const replayKey = {
  cityCode: "hangzhou",
  pageId: "customer.home" as const,
  operation: "create_draft",
  actorId: "concurrent-author",
  idempotencyHash: "a".repeat(64),
};

function duplicateKeyError(): Error & { code: string } {
  return Object.assign(new Error("duplicate idempotency replay"), { code: "ER_DUP_ENTRY" });
}

function repositoryWithConcurrentWinner(winnerFingerprint: string) {
  let replayLookupCount = 0;
  const connection = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT request_fingerprint,response_json")) {
        replayLookupCount += 1;
        return replayLookupCount === 1
          ? [[], []]
          : [[{
              request_fingerprint: winnerFingerprint,
              response_json: JSON.stringify({ revisionId: "winner-revision" }),
            }], []];
      }
      if (sql.includes("INSERT INTO customer_sdui_mutation_records")) {
        throw duplicateKeyError();
      }
      throw new Error(`Unexpected SQL in replay race test: ${sql}`);
    }),
  };
  const pool = {
    getConnection: vi.fn(async () => connection),
  } as unknown as Pool;
  return { repository: new MysqlCustomerSduiRepository(pool), connection };
}

async function replayAwareMutation(
  store: CustomerSduiStore,
  requestFingerprint: string,
): Promise<{ revisionId: string }> {
  const replay = await store.findReplay(replayKey);
  if (replay) {
    if (replay.requestFingerprint !== requestFingerprint) {
      throw new CustomerSduiError("Idempotency key was already used for a different request", 409);
    }
    return replay.response as { revisionId: string };
  }
  const ownResult = { revisionId: "loser-rolled-back" };
  await store.insertReplay({
    ...replayKey,
    mutationId: "sdui_mut_loser",
    requestFingerprint,
    response: ownResult,
  });
  return ownResult;
}

describe("Customer SDUI MySQL idempotency race recovery", () => {
  it("rolls the losing transaction back, reads the committed winner, and avoids a 500", async () => {
    const fingerprint = "b".repeat(64);
    const { repository, connection } = repositoryWithConcurrentWinner(fingerprint);

    await expect(repository.transaction((store) => replayAwareMutation(store, fingerprint)))
      .resolves.toEqual({ revisionId: "winner-revision" });
    expect(connection.beginTransaction).toHaveBeenCalledTimes(2);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it("still returns 409 when the concurrent winner used the key for different content", async () => {
    const { repository, connection } = repositoryWithConcurrentWinner("c".repeat(64));

    await expect(repository.transaction((store) => replayAwareMutation(store, "d".repeat(64))))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(connection.beginTransaction).toHaveBeenCalledTimes(2);
    expect(connection.rollback).toHaveBeenCalledTimes(2);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
