import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CustomerAddress,
  CityCode,
  SaveCustomerAddressRequest,
} from "@xlb/types";

export type CustomerAddressApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "listAddresses" | "createAddress" | "updateAddress" | "deleteAddress"
>;

export type AddressBookLoadResult =
  | {
      readonly status: "ready";
      readonly addresses: readonly CustomerAddress[];
    }
  | {
      readonly status: "empty";
      readonly reasonCode: "no_addresses";
    }
  | {
      readonly status: "error";
      readonly errorCode: "addresses_load_failed" | "addresses_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.addresses";
      readonly reasonCode: "addresses_api_unavailable" | "address_city_mismatch";
    };

export type AddressMutationResult =
  | {
      readonly status: "success";
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "address_changed" | "request_in_flight";
    }
  | {
      readonly status: "not_found";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.addresses";
    }
  | {
      readonly status: "error";
      readonly errorCode: "address_save_failed" | "address_delete_failed";
      readonly retryable: boolean;
    };

function isCapabilityUnavailable(error: ApiClientError): boolean {
  return error.kind === "http" &&
    (error.status === 501 || error.status === 503);
}

function isRetryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" &&
      (error.status === 408 || error.status === 425 || error.status === 429 ||
        (error.status !== undefined && error.status >= 500)));
}

function mutationFailure(
  error: unknown,
  errorCode: "address_save_failed" | "address_delete_failed",
): AddressMutationResult {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({ status: "conflict", reasonCode: "address_changed" });
    }
    if (error.kind === "http" && (error.status === 403 || error.status === 404)) {
      return Object.freeze({ status: "not_found" });
    }
    if (isCapabilityUnavailable(error)) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.addresses",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode,
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({ status: "error", errorCode, retryable: false });
}

export class AddressBookCoordinator {
  readonly #api: CustomerAddressApi;

  constructor(api: CustomerAddressApi) {
    this.#api = api;
  }

  async load(cityCode: CityCode): Promise<AddressBookLoadResult> {
    try {
      const response = await this.#api.listAddresses();
      if (!Array.isArray(response.addresses)) {
        return Object.freeze({
          status: "error",
          errorCode: "addresses_response_invalid",
          retryable: false,
        });
      }
      if (response.addresses.some((address) => address.cityCode !== cityCode)) {
        return Object.freeze({
          status: "unavailable",
          capability: "customer.addresses",
          reasonCode: "address_city_mismatch",
        });
      }
      if (response.addresses.length === 0) {
        return Object.freeze({ status: "empty", reasonCode: "no_addresses" });
      }
      return Object.freeze({
        status: "ready",
        addresses: Object.freeze([...response.addresses]),
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.kind === "http" && error.status === 401) {
          return Object.freeze({ status: "unauthenticated" });
        }
        if (
          error.kind === "http" &&
          (error.status === 404 || isCapabilityUnavailable(error))
        ) {
          return Object.freeze({
            status: "unavailable",
            capability: "customer.addresses",
            reasonCode: "addresses_api_unavailable",
          });
        }
        return Object.freeze({
          status: "error",
          errorCode: "addresses_load_failed",
          retryable: isRetryable(error),
        });
      }
      return Object.freeze({
        status: "error",
        errorCode: "addresses_response_invalid",
        retryable: false,
      });
    }
  }

  async save(
    cityCode: CityCode,
    input: SaveCustomerAddressRequest,
    addressId: string | null,
  ): Promise<AddressMutationResult> {
    try {
      const response = addressId === null
        ? await this.#api.createAddress(input)
        : await this.#api.updateAddress(addressId, input);
      if (response.address.cityCode !== cityCode) {
        return Object.freeze({ status: "conflict", reasonCode: "address_changed" });
      }
      return Object.freeze({ status: "success" });
    } catch (error) {
      return mutationFailure(error, "address_save_failed");
    }
  }

  async delete(addressId: string): Promise<AddressMutationResult> {
    try {
      const response = await this.#api.deleteAddress(addressId);
      if (response.deleted !== true || response.addressId !== addressId) {
        return Object.freeze({
          status: "error",
          errorCode: "address_delete_failed",
          retryable: false,
        });
      }
      return Object.freeze({ status: "success" });
    } catch (error) {
      return mutationFailure(error, "address_delete_failed");
    }
  }
}
