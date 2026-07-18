import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Bell,
  ClipboardText,
  DotsThreeCircle,
  Headset,
  House,
  MagnifyingGlass,
  MapPin,
  SealCheck,
  SquaresFour,
  X,
} from "@phosphor-icons/react";

export type AdminMobileTool = {
  key: string;
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
};

type AdminMobileShellProps = {
  title: string;
  cityLabel: string;
  isDetail: boolean;
  toolPanelOpen: boolean;
  tools: AdminMobileTool[];
  onBack: () => void;
  onOpenOverview: () => void;
  onOpenOrders: () => void;
  onOpenSupport: () => void;
  onOpenApprovals: () => void;
  onOpenTools: () => void;
  onCloseTools: () => void;
  onSearch: () => void;
  onNotifications: () => void;
  onChangeCity: () => void;
  accountLabel: string;
  ordersLabel: "订单派单" | "订单追踪";
  onLogout: () => void;
  activeNav: "overview" | "orders" | "support" | "approvals" | "tools";
  children: ReactNode;
};

const navItems = [
  { key: "overview", label: "总览", Icon: House },
  { key: "orders", label: "", Icon: ClipboardText },
  { key: "support", label: "客服", Icon: Headset },
  { key: "approvals", label: "审批", Icon: SealCheck },
  { key: "tools", label: "我的/更多", Icon: DotsThreeCircle },
] as const;

export function AdminMobileShell({
  title,
  cityLabel,
  isDetail,
  toolPanelOpen,
  tools,
  onBack,
  onOpenOverview,
  onOpenOrders,
  onOpenSupport,
  onOpenApprovals,
  onOpenTools,
  onCloseTools,
  onSearch,
  onNotifications,
  onChangeCity,
  accountLabel,
  ordersLabel,
  onLogout,
  activeNav,
  children,
}: AdminMobileShellProps) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const toolDialogRef = useRef<HTMLElement>(null);
  const wasToolPanelOpen = useRef(false);

  useEffect(() => {
    const syncOnlineStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", syncOnlineStatus);
    window.addEventListener("offline", syncOnlineStatus);
    return () => {
      window.removeEventListener("online", syncOnlineStatus);
      window.removeEventListener("offline", syncOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (toolPanelOpen) {
      wasToolPanelOpen.current = true;
      closeButtonRef.current?.focus();
    } else if (wasToolPanelOpen.current) {
      wasToolPanelOpen.current = false;
      toolsButtonRef.current?.focus();
    }
  }, [toolPanelOpen]);

  function handleToolDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseTools();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(toolDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") || []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const actions = {
    overview: onOpenOverview,
    orders: onOpenOrders,
    support: onOpenSupport,
    approvals: onOpenApprovals,
    tools: onOpenTools,
  };

  return (
    <div className="admin-mobile-shell">
      <header className="admin-mobile-header">
        <div className="admin-mobile-statusbar" aria-label="运营应用状态">
          <strong>喜乐帮运营</strong>
          <span className={online ? undefined : "is-offline"}><i aria-hidden="true" />{online ? "业务在线" : "当前离线"}</span>
        </div>
        <div className="admin-mobile-titlebar">
          {isDetail ? (
            <button className="admin-mobile-icon-button" type="button" aria-label="返回运营总览" onClick={onBack}>
              <ArrowLeft size={22} weight="bold" />
            </button>
          ) : <span className="admin-mobile-brand-mark" aria-hidden="true">喜</span>}
          <div className="admin-mobile-titlecopy">
            <span>{isDetail ? "运营工作台" : "城市运营中心"}</span>
            <h1>{title}</h1>
          </div>
          <button className="admin-mobile-icon-button" type="button" aria-label="搜索订单" onClick={onSearch}>
            <MagnifyingGlass size={21} />
          </button>
          <button className="admin-mobile-icon-button" type="button" aria-label="查看客服通知" onClick={onNotifications}>
            <Bell size={21} />
          </button>
        </div>
        <button className="admin-mobile-city" type="button" onClick={onChangeCity} aria-label={`当前城市：${cityLabel}，点击切换`}>
          <MapPin size={16} weight="fill" />
          <span>{cityLabel}</span>
          <small>切换城市</small>
        </button>
      </header>

      <main className="admin-mobile-content">{children}</main>

      <nav className="admin-mobile-tabbar" aria-label="运营应用主导航">
        {navItems.map(({ key, label, Icon }) => {
          const visibleLabel = key === "orders" ? ordersLabel : label;
          return (
          <button
            key={key}
            ref={key === "tools" ? toolsButtonRef : undefined}
            type="button"
            className={activeNav === key ? "is-active" : undefined}
            aria-current={activeNav === key ? "page" : undefined}
            onClick={actions[key]}
          >
            <Icon size={22} weight={activeNav === key ? "fill" : "regular"} />
            <span>{visibleLabel}</span>
          </button>
          );
        })}
      </nav>

      {toolPanelOpen ? (
        <div className="admin-mobile-tools-backdrop" role="presentation" onClick={onCloseTools}>
          <section
            ref={toolDialogRef}
            className="admin-mobile-tools"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-mobile-tools-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleToolDialogKeyDown}
          >
            <header>
              <div>
                <span>移动运营工具箱</span>
                <h2 id="admin-mobile-tools-title">全部工作台</h2>
              </div>
              <button ref={closeButtonRef} className="admin-mobile-icon-button" type="button" aria-label="关闭全部工具" onClick={onCloseTools}>
                <X size={22} />
              </button>
            </header>
            <div className="admin-mobile-tools-grid">
              {tools.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  className={tool.active ? "is-active" : undefined}
                  onClick={() => { tool.onClick(); onCloseTools(); }}
                >
                  <SquaresFour size={20} weight={tool.active ? "fill" : "regular"} />
                  <span><strong>{tool.label}</strong><small>{tool.description}</small></span>
                </button>
              ))}
            </div>
            <footer className="admin-mobile-account">
              <span><small>当前身份</small><strong>{accountLabel}</strong></span>
              <button type="button" onClick={onLogout}>退出登录</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
