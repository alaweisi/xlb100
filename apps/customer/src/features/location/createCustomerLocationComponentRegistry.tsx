import {
  BrandLogo,
  CustomerButton,
  CustomerComponentRegistry,
} from "@xlb/customer-components";
import type { CustomerLocationActionController } from "./CustomerLocationActionController.js";
import type { CustomerLocationView } from "./CustomerLocationCoordinator.js";

export type CustomerLocationComponentType =
  | "location-brand"
  | "location-heading"
  | "location-status"
  | "location-city-list"
  | "location-capability";

export interface CustomerLocationComponentProps {
  readonly view: CustomerLocationView;
  readonly actions: CustomerLocationActionController;
}

function LocationBrand(_props: CustomerLocationComponentProps) {
  return (
    <div className="xlb-entry-brand">
      <BrandLogo variant="compact" />
      <span>当前服务城市</span>
    </div>
  );
}

function LocationHeading({ view }: CustomerLocationComponentProps) {
  const defaultCity = view.cities.find(
    (city) => city.cityCode === view.profileDefaultCityCode,
  );
  return (
    <header className="xlb-entry-heading">
      <h1>选择服务城市</h1>
      <p>
        城市决定可用服务与正式报价。切换后会清除上一城市的缓存数据。
      </p>
      {defaultCity ? (
        <p className="xlb-entry-status" role="status">
          账户默认城市为 {defaultCity.label}，你也可以选择其他已开通城市。
        </p>
      ) : null}
    </header>
  );
}

function LocationStatus({ view, actions }: CustomerLocationComponentProps) {
  if (view.status === "resolving-profile" || view.status === "checking-capability") {
    return (
      <section className="xlb-entry-status" role="status" aria-live="polite">
        <h2>正在读取城市偏好</h2>
        <p>手动选择入口会一直保留。</p>
      </section>
    );
  }
  if (view.status === "manual-selected") {
    const city = view.cities.find((item) => item.cityCode === view.selectedCityCode);
    return (
      <section className="xlb-entry-status" data-kind="success" role="status" aria-live="polite">
        <h2>已切换到{city?.label ?? "所选城市"}</h2>
        <p>正在返回之前的任务。</p>
      </section>
    );
  }
  if (view.error === null) return null;
  return (
    <section
      className="xlb-entry-status"
      data-kind={view.status === "conflict" ? "conflict" : "error"}
      role="alert"
    >
      <h2>
        {view.status === "unavailable"
          ? "系统定位暂不可用"
          : view.status === "out-of-service"
            ? "城市尚未开通"
            : "城市资料未完全加载"}
      </h2>
      <p>{view.error.message}</p>
      {view.error.retryable ? (
        <CustomerButton type="button" variant="secondary" onClick={() => void actions.retry()}>
          重试加载
        </CustomerButton>
      ) : null}
    </section>
  );
}

function LocationCityList({ view, actions }: CustomerLocationComponentProps) {
  return (
    <section aria-labelledby="customer-city-list-title">
      <h2 id="customer-city-list-title">已开通城市</h2>
      <ul className="xlb-entry-city-list">
        {view.cities.map((city) => (
          <li key={city.cityCode}>
            <button
              type="button"
              className="xlb-entry-city-button"
              data-selected={view.selectedCityCode === city.cityCode}
              aria-pressed={view.selectedCityCode === city.cityCode}
              onClick={() => void actions.selectCity(city.cityCode)}
            >
              <strong>{city.label}</strong>
              <span>
                {view.profileDefaultCityCode === city.cityCode ? "账户默认" : "手动选择"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LocationCapability({ view, actions }: CustomerLocationComponentProps) {
  if (view.status === "unavailable") return null;
  return (
    <section className="xlb-entry-status">
      <h2>系统定位</h2>
      <p>真实定位链尚未接通，不会用默认城市代替定位结果。</p>
      <CustomerButton
        type="button"
        variant="secondary"
        onClick={() => actions.requestSystemLocation()}
      >
        查看定位能力
      </CustomerButton>
    </section>
  );
}

export function createCustomerLocationComponentRegistry() {
  return new CustomerComponentRegistry<CustomerLocationComponentType, CustomerLocationComponentProps>()
    .register("location-brand", LocationBrand)
    .register("location-heading", LocationHeading)
    .register("location-status", LocationStatus)
    .register("location-city-list", LocationCityList)
    .register("location-capability", LocationCapability);
}

export const CUSTOMER_LOCATION_COMPONENT_PLAN: readonly CustomerLocationComponentType[] =
  Object.freeze([
    "location-brand",
    "location-heading",
    "location-status",
    "location-city-list",
    "location-capability",
  ]);
