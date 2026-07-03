import type { Pool } from "mysql2/promise";
import type { RequestContext } from "@xlb/types";
import { getMysqlPool } from "./mysqlPool.js";

export abstract class RepositoryBase {
  protected constructor(protected readonly pool: Pool = getMysqlPool()) {}

  protected requireContext(context?: RequestContext): RequestContext {
    if (!context) {
      throw new RepositoryContextError(
        "RequestContext is required for repository queries",
      );
    }
    return context;
  }
}

export class RepositoryContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryContextError";
  }
}

export function createRepositoryBase(pool?: Pool): RepositoryBase {
  return new (class extends RepositoryBase {
    constructor() {
      super(pool ?? getMysqlPool());
    }
  })();
}
