import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CustomerProfile,
  KnownCityCode,
} from "@xlb/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  getCustomerBrowserEntryRuntime,
} from "../shell/browserEntryRuntime.js";
import {
  isCustomerServiceCity,
} from "../shell/citySelection.js";
import type {
  CustomerAppShellCoordinator,
  CustomerAppShellState,
} from "../shell/CustomerAppShellCoordinator.js";
import {
  CustomerProfileActionController,
  type CustomerProfileActionResult,
} from "./CustomerProfileActionController.js";
import {
  CustomerProfileCoordinator,
  type CustomerProfileLoadResult,
} from "./CustomerProfileCoordinator.js";
import { CustomerProfileTemplate } from "./CustomerProfileTemplate.js";
import {
  profileDraftFrom,
  type CustomerAccountDestination,
  type CustomerProfileDraft,
  type CustomerProfileFieldErrors,
  type CustomerProfileNotice,
  type CustomerProfileRuntimeStatus,
  type CustomerProfileTemplateReadyData,
} from "./profileTypes.js";
import "./customer-profile.css";

export const CUSTOMER_PROFILE_RETRY_EVENT = "xlb:customer-profile-retry";

const DESTINATION_PATHS = Object.freeze({
  addresses: "/profile/addresses",
  coupons: "/coupons",
  notifications: "/notifications",
  support: "/support",
}) satisfies Readonly<Record<CustomerAccountDestination, `/${string}`>>;

export interface CustomerProfileNavigation {
  open(destination: CustomerAccountDestination): void;
  login(): void;
}

function changeBrowserRoute(path: string, replace = false): void {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerProfileNavigation(): CustomerProfileNavigation {
  return Object.freeze({
    open(destination: CustomerAccountDestination) {
      changeBrowserRoute(DESTINATION_PATHS[destination]);
    },
    login() {
      changeBrowserRoute("/auth/login", true);
    },
  });
}

function defaultCoordinator(
  shell: CustomerAppShellCoordinator,
): CustomerProfileCoordinator {
  return new CustomerProfileCoordinator((cityCode) => {
    const client = createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL || "",
      headers: () => {
        const token = shell.accessToken();
        return {
          "x-xlb-city-code": cityCode,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        };
      },
    });
    return customerApi.forClient(client);
  });
}

function recovery() {
  return Object.freeze({
    actionKey: CUSTOMER_PROFILE_RETRY_EVENT,
    labelKey: "重新读取",
  });
}

function boundaryState(
  result: Exclude<CustomerProfileLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerProfileTemplateReadyData> {
  switch (result.status) {
    case "error":
      return Object.freeze({
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
        recovery: result.retryable ? recovery() : null,
      });
    case "conflict":
      return Object.freeze({
        status: "conflict",
        conflictCode: result.reasonCode,
        refreshRequired: true,
        recovery: recovery(),
      });
    case "unauthenticated":
      return Object.freeze({
        status: "error",
        errorCode: "customer_session_expired",
        retryable: false,
        recovery: null,
      });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: result.reasonCode,
        recovery: recovery(),
      });
  }
}

function readyShellContext(
  state: CustomerAppShellState,
): (
  Extract<CustomerAppShellState, { readonly status: "ready" }> & {
    readonly session: NonNullable<
      Extract<CustomerAppShellState, { readonly status: "ready" }>["session"]
    >;
    readonly cityCode: KnownCityCode;
  }
) | null {
  return state.status === "ready" &&
      state.session !== null &&
      state.cityCode !== null
    ? state as Extract<CustomerAppShellState, { readonly status: "ready" }> & {
        readonly session: NonNullable<
          Extract<CustomerAppShellState, { readonly status: "ready" }>["session"]
        >;
        readonly cityCode: KnownCityCode;
      }
    : null;
}

export interface CustomerProfilePageProps
  extends CustomerFeatureRouteComponentProps {
  readonly shell?: CustomerAppShellCoordinator;
  readonly coordinator?: CustomerProfileCoordinator;
  readonly navigation?: CustomerProfileNavigation;
}

export function CustomerProfilePage({
  slice,
  route,
  shell: providedShell,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
}: CustomerProfilePageProps) {
  const runtime = useMemo(
    () => providedShell === undefined
      ? getCustomerBrowserEntryRuntime()
      : null,
    [providedShell],
  );
  const shell = providedShell ?? runtime!.shell;
  const coordinator = useMemo(
    () => providedCoordinator ?? defaultCoordinator(shell),
    [providedCoordinator, shell],
  );
  const controller = useMemo(
    () => new CustomerProfileActionController(coordinator),
    [coordinator],
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerProfileNavigation(),
    [providedNavigation],
  );

  const [loadResult, setLoadResult] =
    useState<CustomerProfileLoadResult | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [draft, setDraft] = useState<CustomerProfileDraft | null>(null);
  const [currentCityCode, setCurrentCityCode] =
    useState<KnownCityCode | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [errors, setErrors] = useState<CustomerProfileFieldErrors>({});
  const [notice, setNotice] = useState<CustomerProfileNotice | null>(null);
  const [operation, setOperation] =
    useState<"idle" | "saving" | "logging-out">("idle");
  const [saved, setSaved] = useState(false);
  const [citySwitchConfirmation, setCitySwitchConfirmation] =
    useState<KnownCityCode | null>(null);
  const requestSequence = useRef(0);

  const clearSessionAndLogin = useCallback(async (
    reason: "expired" | "logout",
  ) => {
    setOperation("logging-out");
    if (reason === "expired") {
      await shell.expireSession();
    } else {
      await shell.logout();
    }
    navigation.login();
  }, [navigation, shell]);

  const load = useCallback(async () => {
    const currentRequest = ++requestSequence.current;
    setLoadResult(null);
    setNotice(null);
    setErrors({});
    let shellState = shell.snapshot();
    if (shellState.status !== "ready") shellState = await shell.restore();
    if (currentRequest !== requestSequence.current) return;
    const context = readyShellContext(shellState);
    if (context === null) {
      await clearSessionAndLogin("expired");
      return;
    }
    setCurrentCityCode(context.cityCode);
    setActorId(context.session.actor.userId);
    const result = await coordinator.load(
      context.session.actor.userId,
      context.cityCode,
    );
    if (currentRequest !== requestSequence.current) return;
    if (result.status === "unauthenticated") {
      setLoadResult(result);
      await clearSessionAndLogin("expired");
      return;
    }
    setLoadResult(result);
    if (result.status === "ready") {
      setProfile(result.profile);
      setDraft(profileDraftFrom(result.profile, context.cityCode));
      setOperation("idle");
      setSaved(false);
      setCitySwitchConfirmation(null);
    }
  }, [clearSessionAndLogin, coordinator, shell]);

  useEffect(() => {
    void load();
    const retry = () => void load();
    window.addEventListener(CUSTOMER_PROFILE_RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(CUSTOMER_PROFILE_RETRY_EVENT, retry);
    };
  }, [load]);

  const dirty = profile !== null && draft !== null &&
    (draft.name !== profile.name ||
      draft.defaultCityCode !==
        (profile.defaultCityCode ?? currentCityCode));

  const settleSaveFailure = useCallback(async (
    result: Exclude<
      CustomerProfileActionResult,
      { readonly status: "success" | "validation_error" }
    >,
  ) => {
    switch (result.status) {
      case "unauthenticated":
        setLoadResult(result);
        await clearSessionAndLogin("expired");
        return;
      case "unavailable":
        setLoadResult(Object.freeze({
          status: "unavailable",
          capability: result.capability,
          reasonCode: "profile_api_unavailable",
        }));
        return;
      case "conflict":
        if (result.reasonCode === "request_in_flight") {
          setNotice(Object.freeze({
            kind: "conflict",
            message: "资料保存正在处理中，请等待服务端响应。",
          }));
          return;
        }
        await load();
        setNotice(Object.freeze({
          kind: "conflict",
          message: "资料已变化，页面已重新读取服务端事实，请确认后再保存。",
        }));
        return;
      case "error":
        setNotice(Object.freeze({
          kind: "error",
          message: result.retryable
            ? "保存结果尚未确认，请保留当前输入后重试。"
            : "服务端未接受本次资料更新，请检查后重试。",
        }));
    }
  }, [clearSessionAndLogin, load]);

  const save = useCallback(async () => {
    if (
      profile === null ||
      draft === null ||
      actorId === null ||
      currentCityCode === null ||
      operation !== "idle"
    ) {
      return;
    }
    setOperation("saving");
    setErrors({});
    setNotice(null);
    const result = await controller.save(actorId, draft);
    if (result.status === "validation_error") {
      setErrors(result.errors);
      setOperation("idle");
      return;
    }
    if (result.status !== "success") {
      setOperation("idle");
      await settleSaveFailure(result);
      return;
    }

    // The mutation response replaces every displayed profile fact.
    setProfile(result.profile);
    setDraft(profileDraftFrom(result.profile, currentCityCode));
    setOperation("idle");
    setSaved(true);
    setNotice(Object.freeze({
      kind: "success",
      message: "个人资料已由服务端确认保存。",
    }));
    if (
      isCustomerServiceCity(result.profile.defaultCityCode) &&
      result.profile.defaultCityCode !== currentCityCode
    ) {
      setCitySwitchConfirmation(result.profile.defaultCityCode);
    }
  }, [
    actorId,
    controller,
    currentCityCode,
    draft,
    operation,
    profile,
    settleSaveFailure,
  ]);

  const status: CustomerProfileRuntimeStatus = operation === "saving"
    ? "saving"
    : operation === "logging-out"
      ? "logging-out"
      : dirty
        ? "dirty"
        : saved
          ? "saved"
          : "ready";

  let state: CustomerSliceState<CustomerProfileTemplateReadyData>;
  if (loadResult === null) {
    state = Object.freeze({
      status: "loading",
      requestKey: null,
      previousActorDataVisible: false,
    });
  } else if (loadResult.status !== "ready" || profile === null ||
      draft === null || currentCityCode === null) {
    state = loadResult.status === "ready"
      ? Object.freeze({
          status: "error",
          errorCode: "profile_response_invalid",
          retryable: false,
          recovery: null,
        })
      : boundaryState(loadResult);
  } else {
    const actions = Object.freeze({
      onNameChange(name: string) {
        setDraft((current) => current === null
          ? current
          : Object.freeze({ ...current, name }));
        setErrors((current) => Object.freeze({ ...current, name: undefined }));
        setSaved(false);
      },
      onDefaultCityChange(cityCode: KnownCityCode) {
        setDraft((current) => current === null
          ? current
          : Object.freeze({ ...current, defaultCityCode: cityCode }));
        setErrors((current) => Object.freeze({
          ...current,
          defaultCityCode: undefined,
        }));
        setSaved(false);
      },
      onSave() {
        void save();
      },
      onNavigate(destination: CustomerAccountDestination) {
        navigation.open(destination);
      },
      onLogout() {
        if (operation === "idle") void clearSessionAndLogin("logout");
      },
      onConfirmCitySwitch() {
        const targetCity = citySwitchConfirmation;
        if (targetCity === null) return;
        void (async () => {
          const next = await shell.selectCity(targetCity);
          if (next.status === "ready" && next.cityCode === targetCity) {
            setCurrentCityCode(targetCity);
            setCitySwitchConfirmation(null);
            setNotice(Object.freeze({
              kind: "success",
              message: `当前服务城市已切换为${
                next.cityCode === "hangzhou"
                  ? "杭州"
                  : next.cityCode === "shanghai"
                    ? "上海"
                    : "北京"
              }。`,
            }));
          } else {
            setNotice(Object.freeze({
              kind: "error",
              message: "当前服务城市未能安全切换，请稍后重试。",
            }));
          }
        })();
      },
      onDeclineCitySwitch() {
        setCitySwitchConfirmation(null);
        setNotice(Object.freeze({
          kind: "success",
          message: "已保留当前服务城市；账户默认城市仍按服务端保存结果展示。",
        }));
      },
      onDismissNotice() {
        setNotice(null);
      },
    });
    state = Object.freeze({
      status: "ready",
      data: Object.freeze({
        viewModel: Object.freeze({
          profile,
          draft,
          currentCityCode,
          status,
          errors,
          notice,
          citySwitchConfirmation,
        }),
        actions,
      }),
    });
  }

  return (
    <CustomerProfileTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerProfilePage;
