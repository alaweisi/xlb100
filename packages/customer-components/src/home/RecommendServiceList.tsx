import { ArrowRight, ImageSquare } from "@phosphor-icons/react";
import type { CustomerHomeComponentProps, HomeRecommendedService } from "./homeTypes.js";
import { readArray } from "./homeTypes.js";
import { HomeSection } from "./HomeSection.js";

export function RecommendServiceList({
  instance,
  data,
  actions,
}: CustomerHomeComponentProps<"recommend_list">) {
  const items = readArray<HomeRecommendedService>(data.items).slice(0, instance.props.maxItems);

  return (
    <HomeSection
      title={instance.props.title}
      actionLabel={actions["view-all"] ? "更多" : undefined}
      onAction={actions["view-all"] ? () => void actions["view-all"]?.invoke() : undefined}
    >
      {items.length === 0 ? (
        <p className="xlb-home-inline-state">当前城市暂无推荐服务</p>
      ) : (
        <div className="xlb-home-recommend-list" data-density={instance.props.cardDensity}>
          {items.map((item) => (
            <button
              type="button"
              className="xlb-home-recommend-card"
              key={item.skuId}
              onClick={() => void actions.item?.invoke({ skuId: item.skuId })}
            >
              <span className="xlb-home-recommend-card__visual">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <span aria-label="服务图片暂缺">
                    <ImageSquare aria-hidden="true" weight="duotone" />
                    <small>服务图片暂缺</small>
                  </span>
                )}
              </span>
              <strong>{item.name}</strong>
              <small>{item.priceLabel ?? `按${item.unit}计价`}</small>
              <span className="xlb-home-recommend-card__action">
                查看服务 <ArrowRight aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      )}
    </HomeSection>
  );
}
