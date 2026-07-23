import {
  BottomNavigation,
  LocationHeader,
  NearbyServiceProvider,
  PromotionBanner,
  RecommendServiceList,
  SearchBar,
  ServiceCategoryGrid,
  TrustGuarantee,
} from "@xlb/customer-components";
import { HomeComponentRegistry } from "../../platform/sdui/composition/HomeComponentRegistry.js";

/** The only application-owned allowlist that maps manifest keys to bundled code. */
export function createHomeComponentRegistry(): HomeComponentRegistry {
  return new HomeComponentRegistry()
    .register({
      type: "location_header",
      region: "header",
      supportedContractVersions: ["1.0"],
      dataSlots: [
        { slot: "location", dataKeys: ["customer.current_location"], required: true },
        { slot: "notifications", dataKeys: ["customer.notification_summary"], required: false },
      ],
      actionSlots: [
        { slot: "location", actionKeys: ["location.open_picker"], required: true },
        { slot: "notification", actionKeys: ["notification.open_center"], required: false },
      ],
      component: LocationHeader,
    })
    .register({
      type: "search_bar",
      region: "header",
      supportedContractVersions: ["1.0"],
      dataSlots: [],
      actionSlots: [
        { slot: "submit", actionKeys: ["search.submit"], required: true },
      ],
      component: SearchBar,
    })
    .register({
      type: "service_grid",
      region: "content",
      supportedContractVersions: ["1.0"],
      dataSlots: [
        { slot: "items", dataKeys: ["catalog.service_categories"], required: true },
      ],
      actionSlots: [
        { slot: "item", actionKeys: ["service.open_category"], required: true },
        { slot: "view-all", actionKeys: ["service.open_all"], required: false },
      ],
      component: ServiceCategoryGrid,
    })
    .register({
      type: "promotion_banner",
      region: "content",
      supportedContractVersions: ["1.0"],
      dataSlots: [
        { slot: "items", dataKeys: ["content.home_promotions"], required: false },
      ],
      actionSlots: [
        { slot: "item", actionKeys: ["promotion.open"], required: false },
      ],
      component: PromotionBanner,
    })
    .register({
      type: "recommend_list",
      region: "content",
      supportedContractVersions: ["1.0"],
      dataSlots: [
        { slot: "items", dataKeys: ["catalog.recommended_services"], required: false },
      ],
      actionSlots: [
        { slot: "item", actionKeys: ["service.open_detail"], required: false },
      ],
      component: RecommendServiceList,
    })
    .register({
      type: "worker_nearby",
      region: "content",
      supportedContractVersions: ["1.0"],
      dataSlots: [
        { slot: "items", dataKeys: ["provider.nearby"], required: false },
      ],
      actionSlots: [
        { slot: "item", actionKeys: ["provider.open_detail"], required: false },
        { slot: "view-all", actionKeys: ["provider.open_all"], required: false },
      ],
      component: NearbyServiceProvider,
    })
    .register({
      type: "trust_guarantee",
      region: "content",
      supportedContractVersions: ["1.0"],
      dataSlots: [
        { slot: "items", dataKeys: ["content.trust_guarantees"], required: false },
      ],
      actionSlots: [],
      component: TrustGuarantee,
    })
    .register({
      type: "bottom_navigation",
      region: "footer",
      supportedContractVersions: ["1.0"],
      dataSlots: [],
      actionSlots: [
        { slot: "home", actionKeys: ["navigation.open_home"], required: true },
        { slot: "support", actionKeys: ["navigation.open_support"], required: true },
        { slot: "orders", actionKeys: ["navigation.open_orders"], required: true },
        { slot: "profile", actionKeys: ["navigation.open_profile"], required: true },
        { slot: "demand", actionKeys: ["demand.open_create"], required: false },
      ],
      component: BottomNavigation,
    })
    .seal();
}
