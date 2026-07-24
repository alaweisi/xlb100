import type { CustomerHomeComponentProps, HomePromotion } from "./homeTypes.js";
import { readArray } from "./homeTypes.js";
import { HomeSection } from "./HomeSection.js";

export function PromotionBanner({
  instance,
  data,
  actions,
}: CustomerHomeComponentProps<"promotion_banner">) {
  const promotions = readArray<HomePromotion>(data.items);
  if (promotions.length === 0) return null;

  return (
    <HomeSection title={instance.props.title ?? "精选活动"}>
      <div className="xlb-home-promotion-list">
        {promotions.map((promotion) => (
          <button
            type="button"
            className="xlb-home-promotion"
            key={promotion.promotionId}
            aria-label={promotion.accessibleLabel}
            onClick={() => void actions.item?.invoke({ promotionId: promotion.promotionId })}
          >
            {promotion.imageUrl ? <img src={promotion.imageUrl} alt="" aria-hidden="true" /> : null}
            <span>
              <strong>{promotion.title}</strong>
              {promotion.subtitle ? <small>{promotion.subtitle}</small> : null}
            </span>
          </button>
        ))}
      </div>
    </HomeSection>
  );
}
