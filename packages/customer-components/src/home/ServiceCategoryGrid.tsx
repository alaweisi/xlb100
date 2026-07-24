import type { CustomerHomeComponentProps, HomeServiceCategory } from "./homeTypes.js";
import { readArray } from "./homeTypes.js";
import { HomeSection } from "./HomeSection.js";
import { resolveHomeCategoryAsset } from "./homeCategoryAssets.js";

export function ServiceCategoryGrid({
  instance,
  data,
  actions,
}: CustomerHomeComponentProps<"service_grid">) {
  const items = readArray<HomeServiceCategory>(data.items).slice(0, instance.props.maxItems);

  return (
    <HomeSection
      title={instance.props.title}
      actionLabel={instance.props.showViewAll ? "查看全部" : undefined}
      onAction={instance.props.showViewAll ? () => void actions["view-all"]?.invoke() : undefined}
    >
      {items.length === 0 ? (
        <p className="xlb-home-inline-state">服务类目正在同步</p>
      ) : (
        <div className="xlb-home-service-grid" data-columns={instance.props.columns}>
          {items.map((item) => {
            const asset = resolveHomeCategoryAsset(item.categoryId);
            return (
            <button
              type="button"
              className="xlb-home-service-card"
              key={item.categoryId}
              title={item.name}
              onClick={() => void actions.item?.invoke({ categoryId: item.categoryId })}
              aria-label={`查看${item.name}服务`}
            >
              {asset ? (
                <img
                  src={asset}
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <span className="xlb-home-service-card__asset-fallback" aria-hidden="true" />
              )}
              <span>{item.name}</span>
            </button>
            );
          })}
        </div>
      )}
    </HomeSection>
  );
}
