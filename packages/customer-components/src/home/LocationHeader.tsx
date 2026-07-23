import { Bell, MapPin } from "@phosphor-icons/react";
import { BrandLogo } from "../foundation/BrandLogo.js";
import type { CustomerHomeComponentProps, HomeCurrentLocation, HomeNotificationSummary } from "./homeTypes.js";
import { readObject } from "./homeTypes.js";

export function LocationHeader({
  instance,
  data,
  actions,
}: CustomerHomeComponentProps<"location_header">) {
  const location = readObject<HomeCurrentLocation>(data.location);
  const notifications = readObject<HomeNotificationSummary>(data.notifications);
  const unreadCount = notifications?.unreadCount ?? 0;

  return (
    <header className="xlb-home-location-header">
      <div className="xlb-home-location-header__brand">
        <BrandLogo variant="header" />
        {instance.props.subtitle ? <p>{instance.props.subtitle}</p> : null}
      </div>
      {instance.props.showNotifications ? (
        <button
          type="button"
          className="xlb-home-icon-button"
          aria-label={unreadCount > 0 ? `消息中心，${unreadCount} 条未读` : "消息中心"}
          onClick={() => actions.notification?.invoke()}
        >
          <Bell aria-hidden="true" size={25} />
          {unreadCount > 0 ? <span className="xlb-home-notification-dot" /> : null}
        </button>
      ) : null}
      <button
        type="button"
        className="xlb-home-location-chip"
        onClick={() => actions.location?.invoke()}
        aria-label={`选择服务地址，当前${location?.displayLabel ?? "未定位"}`}
      >
        <MapPin aria-hidden="true" weight="fill" />
        <span>{location?.displayLabel ?? "选择服务地址"}</span>
      </button>
    </header>
  );
}
