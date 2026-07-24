import type { CityCode, SaveCustomerAddressRequest } from "@xlb/types";
import { saveCustomerAddressSchema } from "@xlb/validators";
import type {
  AddressBookCoordinator,
  AddressMutationResult,
} from "./AddressBookCoordinator.js";
import type {
  CustomerAddressFormDraft,
  CustomerAddressFormErrors,
  CustomerAddressFormField,
} from "./addressBookTypes.js";

export interface CustomerAddressActionScope {
  readonly addressIds: ReadonlySet<string>;
}

export type AddressSaveActionResult =
  | {
      readonly status: "validation_error";
      readonly errors: CustomerAddressFormErrors;
    }
  | AddressMutationResult;

function fieldMessage(field: CustomerAddressFormField): string {
  switch (field) {
    case "contactName":
      return "请输入 1–64 个字符的联系人姓名";
    case "contactPhone":
      return "请输入 11 位手机号码";
    case "province":
      return "请输入省份或直辖市";
    case "city":
      return "请输入城市";
    case "district":
      return "请输入区县";
    case "detailAddress":
      return "请输入 2–255 个字符的详细地址";
  }
}

function validationErrors(
  issues: readonly { readonly path: PropertyKey[] }[],
): CustomerAddressFormErrors {
  const errors: Partial<Record<CustomerAddressFormField | "form", string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (
      field === "contactName" ||
      field === "contactPhone" ||
      field === "province" ||
      field === "city" ||
      field === "district" ||
      field === "detailAddress"
    ) {
      errors[field] ??= fieldMessage(field);
    } else {
      errors.form ??= "请检查地址信息后重试";
    }
  }
  return Object.freeze(errors);
}

export function createAddressIdempotencyKey(): string {
  const suffix = typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-address-${suffix}`;
}

export function addressDraftCanSubmit(draft: CustomerAddressFormDraft): boolean {
  return draft.contactName.trim().length > 0 &&
    draft.contactPhone.trim().length > 0 &&
    draft.province.trim().length > 0 &&
    draft.city.trim().length > 0 &&
    draft.district.trim().length > 0 &&
    draft.detailAddress.trim().length > 0;
}

export class AddressBookActionController {
  readonly #coordinator: AddressBookCoordinator;
  #operationInFlight = false;

  constructor(coordinator: AddressBookCoordinator) {
    this.#coordinator = coordinator;
  }

  async save(
    cityCode: CityCode,
    draft: CustomerAddressFormDraft,
    idempotencyKey: string,
    addressId: string | null,
    scope: CustomerAddressActionScope,
  ): Promise<AddressSaveActionResult> {
    if (addressId !== null && !scope.addressIds.has(addressId)) {
      return Object.freeze({ status: "not_found" });
    }
    const parsed = saveCustomerAddressSchema.safeParse({
      idempotencyKey,
      ...draft,
    });
    if (!parsed.success) {
      return Object.freeze({
        status: "validation_error",
        errors: validationErrors(parsed.error.issues),
      });
    }
    if (this.#operationInFlight) {
      return Object.freeze({ status: "conflict", reasonCode: "request_in_flight" });
    }

    this.#operationInFlight = true;
    try {
      return await this.#coordinator.save(
        cityCode,
        parsed.data satisfies SaveCustomerAddressRequest,
        addressId,
      );
    } finally {
      this.#operationInFlight = false;
    }
  }

  async delete(
    addressId: string,
    scope: CustomerAddressActionScope,
  ): Promise<AddressMutationResult> {
    if (!scope.addressIds.has(addressId)) {
      return Object.freeze({ status: "not_found" });
    }
    if (this.#operationInFlight) {
      return Object.freeze({ status: "conflict", reasonCode: "request_in_flight" });
    }
    this.#operationInFlight = true;
    try {
      return await this.#coordinator.delete(addressId);
    } finally {
      this.#operationInFlight = false;
    }
  }
}
