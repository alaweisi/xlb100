import {
  ClipboardText,
  Headset,
  House,
  Plus,
  UserCircle,
} from "@phosphor-icons/react";
import type { CustomerHomeComponentProps } from "./homeTypes.js";

export function BottomNavigation({
  instance,
  actions,
}: CustomerHomeComponentProps<"bottom_navigation">) {
  const navigation = [
    { key: "home", label: "首页", icon: House },
    { key: "support", label: "客服", icon: Headset },
    { key: "orders", label: "订单", icon: ClipboardText },
    { key: "profile", label: "我的", icon: UserCircle },
  ] as const;

  return (
    <nav className="xlb-home-bottom-navigation" aria-label="主要导航">
      {navigation.slice(0, 2).map((item) => {
        const ItemIcon = item.icon;
        return (
          <button
            type="button"
            key={item.key}
            aria-current={instance.props.activeItem === item.key ? "page" : undefined}
            onClick={() => void actions[item.key]?.invoke()}
          >
            <ItemIcon aria-hidden="true" weight={item.key === instance.props.activeItem ? "fill" : "regular"} />
            <span>{item.label}</span>
          </button>
        );
      })}
      {instance.props.showDemandAction ? (
        <button
          type="button"
          className="xlb-home-bottom-navigation__demand"
          onClick={() => void actions.demand?.invoke()}
        >
          <span><Plus aria-hidden="true" weight="bold" /></span>
          <strong>发布需求</strong>
        </button>
      ) : null}
      {navigation.slice(2).map((item) => {
        const ItemIcon = item.icon;
        return (
          <button
            type="button"
            key={item.key}
            onClick={() => void actions[item.key]?.invoke()}
          >
            <ItemIcon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
