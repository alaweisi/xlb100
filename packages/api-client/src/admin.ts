import type { ApiClient } from "./createApiClient.js";
import { createSettlementApi } from "./settlement.js";

/** Admin API modules; callers provide scoped admin/operator headers. */
export function createAdminApi(client: ApiClient) {
  return { settlement: createSettlementApi(client) };
}

export const adminApi = { create: createAdminApi };
