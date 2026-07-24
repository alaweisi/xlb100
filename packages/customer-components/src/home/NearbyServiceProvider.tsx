import { MapPin, SealCheck, UserCircle } from "@phosphor-icons/react";
import type { CustomerHomeComponentProps, HomeNearbyProvider } from "./homeTypes.js";
import { readArray } from "./homeTypes.js";
import { HomeSection } from "./HomeSection.js";

function distanceLabel(distanceMeters: number | null): string | null {
  if (distanceMeters === null) return null;
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)}m`;
  return `${(distanceMeters / 1_000).toFixed(1)}km`;
}

export function NearbyServiceProvider({
  instance,
  data,
  actions,
}: CustomerHomeComponentProps<"worker_nearby">) {
  const items = readArray<HomeNearbyProvider>(data.items).slice(0, instance.props.maxItems);

  return (
    <HomeSection
      title={instance.props.title}
      actionLabel="更多"
      onAction={() => void actions["view-all"]?.invoke()}
    >
      {items.length === 0 ? (
        <p className="xlb-home-inline-state">附近师傅将在获得定位与可用服务数据后展示</p>
      ) : (
        <div className="xlb-home-provider-list">
          {items.map((provider) => (
            <button
              type="button"
              className="xlb-home-provider-card"
              key={provider.providerId}
              onClick={() => void actions.item?.invoke({ providerId: provider.providerId })}
            >
              {provider.avatarUrl ? (
                <img src={provider.avatarUrl} alt="" aria-hidden="true" />
              ) : (
                <UserCircle aria-hidden="true" weight="duotone" />
              )}
              <span>
                <strong>{provider.displayName}</strong>
                {instance.props.showVerification && provider.verified ? (
                  <small><SealCheck aria-hidden="true" weight="fill" /> 实名认证</small>
                ) : null}
                {instance.props.showDistance && distanceLabel(provider.distanceMeters) ? (
                  <small><MapPin aria-hidden="true" /> {distanceLabel(provider.distanceMeters)}</small>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </HomeSection>
  );
}
