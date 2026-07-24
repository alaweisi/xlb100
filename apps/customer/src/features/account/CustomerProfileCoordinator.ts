import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CustomerProfile,
  KnownCityCode,
  UpdateCustomerProfileRequest,
} from "@xlb/types";

export type CustomerProfileApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "getProfile" | "updateProfile"
>;

export type CustomerProfileApiFactory = (
  cityCode: KnownCityCode,
) => CustomerProfileApi;

export type CustomerProfileLoadResult =
  | {
      readonly status: "ready";
      readonly profile: CustomerProfile;
    }
  | {
      readonly status: "error";
      readonly errorCode: "profile_load_failed" | "profile_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "profile_actor_mismatch";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.profile";
      readonly reasonCode: "profile_api_unavailable";
    };

export type CustomerProfileSaveResult =
  | {
      readonly status: "success";
      readonly profile: CustomerProfile;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "profile_changed" | "profile_actor_mismatch";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.profile";
    }
  | {
      readonly status: "error";
      readonly errorCode: "profile_save_failed" | "profile_response_invalid";
      readonly retryable: boolean;
    };

function capabilityUnavailable(error: ApiClientError): boolean {
  return error.kind === "http" &&
    (error.status === 501 || error.status === 503);
}

function retryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" &&
      (error.status === 408 || error.status === 425 || error.status === 429 ||
        (error.status !== undefined && error.status >= 500)));
}

function responseHasProfile(
  response: unknown,
): response is { readonly profile: CustomerProfile } {
  if (typeof response !== "object" || response === null) return false;
  const profile = (response as { readonly profile?: unknown }).profile;
  return typeof profile === "object" && profile !== null &&
    typeof (profile as CustomerProfile).customerId === "string" &&
    typeof (profile as CustomerProfile).phoneMasked === "string" &&
    typeof (profile as CustomerProfile).name === "string";
}

export class CustomerProfileCoordinator {
  constructor(private readonly apiForCity: CustomerProfileApiFactory) {}

  async load(
    actorId: string,
    currentCityCode: KnownCityCode,
  ): Promise<CustomerProfileLoadResult> {
    try {
      const response = await this.apiForCity(currentCityCode).getProfile();
      if (!responseHasProfile(response)) {
        return Object.freeze({
          status: "error",
          errorCode: "profile_response_invalid",
          retryable: false,
        });
      }
      if (response.profile.customerId !== actorId) {
        return Object.freeze({
          status: "conflict",
          reasonCode: "profile_actor_mismatch",
        });
      }
      return Object.freeze({
        status: "ready",
        profile: Object.freeze({ ...response.profile }),
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.kind === "http" && error.status === 401) {
          return Object.freeze({ status: "unauthenticated" });
        }
        if (capabilityUnavailable(error)) {
          return Object.freeze({
            status: "unavailable",
            capability: "customer.profile",
            reasonCode: "profile_api_unavailable",
          });
        }
        return Object.freeze({
          status: "error",
          errorCode: "profile_load_failed",
          retryable: retryable(error),
        });
      }
      return Object.freeze({
        status: "error",
        errorCode: "profile_response_invalid",
        retryable: false,
      });
    }
  }

  async save(
    actorId: string,
    input: UpdateCustomerProfileRequest & {
      readonly defaultCityCode: KnownCityCode;
    },
  ): Promise<CustomerProfileSaveResult> {
    try {
      // The formal backend requires the request city scope to match the new
      // default. This does not mutate the shell's current service city.
      const response = await this.apiForCity(input.defaultCityCode)
        .updateProfile(input);
      if (!responseHasProfile(response)) {
        return Object.freeze({
          status: "error",
          errorCode: "profile_response_invalid",
          retryable: false,
        });
      }
      if (response.profile.customerId !== actorId) {
        return Object.freeze({
          status: "conflict",
          reasonCode: "profile_actor_mismatch",
        });
      }
      return Object.freeze({
        status: "success",
        profile: Object.freeze({ ...response.profile }),
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.kind === "http" && error.status === 401) {
          return Object.freeze({ status: "unauthenticated" });
        }
        if (error.kind === "http" && error.status === 409) {
          return Object.freeze({
            status: "conflict",
            reasonCode: "profile_changed",
          });
        }
        if (
          capabilityUnavailable(error) ||
          (error.kind === "http" &&
            (error.status === 403 || error.status === 404))
        ) {
          return Object.freeze({
            status: "unavailable",
            capability: "customer.profile",
          });
        }
        return Object.freeze({
          status: "error",
          errorCode: "profile_save_failed",
          retryable: retryable(error),
        });
      }
      return Object.freeze({
        status: "error",
        errorCode: "profile_response_invalid",
        retryable: false,
      });
    }
  }
}
