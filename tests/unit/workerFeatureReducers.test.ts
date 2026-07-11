import { describe, expect, it } from "vitest";
import { authReducer } from "../../apps/worker/src/features/auth/store";
import { initialTasksState, tasksReducer } from "../../apps/worker/src/features/tasks/reducer";
import { fulfillmentReducer, initialFulfillmentState } from "../../apps/worker/src/features/fulfillment/reducer";
import { financeReducer, initialFinanceState } from "../../apps/worker/src/features/finance/reducer";

describe("worker feature reducers", () => {
  it("keeps authentication city and session transitions explicit", () => {
    const city = authReducer({ cityCode: "hangzhou", session: null }, { type: "cityChanged", cityCode: "shanghai" });
    const session = { ok: true as const, token: "token", userId: "worker-1", role: "worker" as const };
    expect(authReducer(city, { type: "sessionChanged", session })).toEqual({ cityCode: "shanghai", session });
    expect(authReducer({ ...city, session }, { type: "sessionChanged", session: null }).session).toBeNull();
  });

  it("models task loading, failure and clear without stale errors", () => {
    const loading = tasksReducer(initialTasksState, { type: "loading" });
    expect(loading).toMatchObject({ loading: true, error: null });
    const failed = tasksReducer(loading, { type: "failed", error: "timeout" });
    expect(failed).toMatchObject({ loading: false, error: "timeout" });
    expect(tasksReducer(failed, { type: "cleared" })).toEqual(initialTasksState);
  });

  it("tracks fulfillment selection and lifecycle busy state", () => {
    const selected = fulfillmentReducer(initialFulfillmentState, {
      type: "selected",
      fulfillment: { fulfillmentId: "ful-1" } as never,
    });
    expect(fulfillmentReducer(selected, { type: "lifecycleBusy", busy: true })).toMatchObject({
      selected: { fulfillmentId: "ful-1" }, lifecycleBusy: true,
    });
  });

  it("clears finance errors after a successful load", () => {
    const failed = financeReducer(initialFinanceState, { type: "failed", error: "bank unavailable" });
    const loaded = financeReducer(failed, {
      type: "loaded",
      balance: { availableAmount: 350 } as never,
      bankAccounts: [{ bankAccountId: "bank-1" }] as never,
      withdrawals: [],
    });
    expect(loaded).toMatchObject({ busy: false, error: null, balance: { availableAmount: 350 } });
  });
});
