import { Card, ServiceCard, ScopeBadge, StateBadge, StatCard, RuntimeThemeSurface } from "../index.js";
import { CustomerAnswerCard, ApiErrorPanel, CustomerQuoteCard, NotWiredState } from "../index.js";

export interface PromoBannerViewModel {
  headline: string;
  subtitle?: string;
  ctaLabel?: string;
}

export type OrderStatusTone = "default" | "primary" | "success" | "warning" | "danger" | "muted";

export interface ServiceDiscoveryViewModel {
  title: string;
  subtitle?: string;
  priceText?: string;
  status?: string;
}

export interface OrderStatusViewModel {
  label: string;
  tone: OrderStatusTone;
  statusText?: string;
}

export interface CustomerQuoteViewModel {
  label: string;
  meta?: string;
  priceLabel?: string;
  priceAmount?: number;
  currency?: string;
}

export interface WorkerKpiViewModel {
  label: string;
  value: string;
  tone?: "default" | "muted" | "warning" | "success";
  hint?: string;
  trend?: string;
}

export function PromoBanner({ model }: { model: PromoBannerViewModel }) {
  return (
    <Card title={model.headline} style={{ background: "rgba(255, 250, 240, 0.9)" }}>
      {model.subtitle ? <p style={{ margin: 0, color: "#334155", fontSize: 14 }}>{model.subtitle}</p> : null}
      {model.ctaLabel ? <span style={{ fontSize: 12, fontWeight: 600, color: "#B85F2A" }}>{model.ctaLabel}</span> : null}
    </Card>
  );
}

export function OrderStatusBadge({ model, label }: { model: OrderStatusViewModel; label?: string }) {
  return <StateBadge label={label ?? model.label} tone={model.tone} />;
}

export function ServiceDiscoveryCard({
  model,
  actions,
  onCardClick,
}: {
  model: ServiceDiscoveryViewModel;
  actions?: string;
  onCardClick?: () => void;
}) {
  return (
    <ServiceCard
      title={model.title}
      subtitle={model.subtitle}
      status={model.status ? <ScopeBadge scope={model.status} /> : undefined}
      priceText={model.priceText}
      actionLabel={actions}
      onClick={onCardClick}
    />
  );
}

export function WorkerKpiCard({ label, value, tone = "default", hint, trend }: WorkerKpiViewModel) {
  return <StatCard label={label} value={value} tone={tone} hint={hint} trend={trend} />;
}

export { CustomerAnswerCard, ApiErrorPanel, CustomerQuoteCard, NotWiredState, RuntimeThemeSurface };
