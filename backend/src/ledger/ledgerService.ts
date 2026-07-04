import type { RequestContext } from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { ledgerOutboxConsumer } from "./ledgerOutboxConsumer.js";
import { ledgerRepository } from "./ledgerRepository.js";

export const ledgerService = {
  runOnce: (context: RequestContext) => ledgerOutboxConsumer.runOnce(context),
  listAccruals: (context: RequestContext) =>
    ledgerRepository.listAccruals(
      context,
      assertCityScopedContext(context),
    ),
};
