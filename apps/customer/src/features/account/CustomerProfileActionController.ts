import type {
  KnownCityCode,
  UpdateCustomerProfileRequest,
} from "@xlb/types";
import { updateCustomerProfileSchema } from "@xlb/validators";
import type {
  CustomerProfileCoordinator,
  CustomerProfileSaveResult,
} from "./CustomerProfileCoordinator.js";
import type {
  CustomerProfileDraft,
  CustomerProfileFieldErrors,
} from "./profileTypes.js";

export type CustomerProfileActionResult =
  | {
      readonly status: "validation_error";
      readonly errors: CustomerProfileFieldErrors;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode:
        | "request_in_flight"
        | "profile_changed"
        | "profile_actor_mismatch";
    }
  | CustomerProfileSaveResult;

function fieldErrors(
  issues: readonly { readonly path: PropertyKey[] }[],
): CustomerProfileFieldErrors {
  const errors: Partial<
    Record<"name" | "defaultCityCode" | "form", string>
  > = {};
  for (const issue of issues) {
    if (issue.path[0] === "name") {
      errors.name ??= "请输入 1–64 个字符的姓名";
    } else if (issue.path[0] === "defaultCityCode") {
      errors.defaultCityCode ??= "请选择正式服务城市";
    } else {
      errors.form ??= "请检查资料后重试";
    }
  }
  return Object.freeze(errors);
}

export class CustomerProfileActionController {
  #operationInFlight = false;

  constructor(private readonly coordinator: CustomerProfileCoordinator) {}

  async save(
    actorId: string,
    draft: CustomerProfileDraft,
  ): Promise<CustomerProfileActionResult> {
    const parsed = updateCustomerProfileSchema.safeParse({
      name: draft.name,
      defaultCityCode: draft.defaultCityCode,
    });
    if (!parsed.success) {
      return Object.freeze({
        status: "validation_error",
        errors: fieldErrors(parsed.error.issues),
      });
    }
    if (this.#operationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }

    this.#operationInFlight = true;
    try {
      return await this.coordinator.save(
        actorId,
        parsed.data as UpdateCustomerProfileRequest & {
          readonly defaultCityCode: KnownCityCode;
        },
      );
    } finally {
      this.#operationInFlight = false;
    }
  }
}
