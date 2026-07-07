import { useEffect, useMemo, useState } from "react";
import type { CityCode, Order } from "@xlb/types";
import { CustomerAnswerCard, CustomerOrdersTemplate, EmptyState, ErrorState, LoadingState, OrderCard, StatusTag } from "@xlb/ui";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { UatDebugPanel } from "./customerPageShell";

interface CustomerOrderApi {
  getOrder(orderId: string): Promise<{ order: Order }>;
}

export interface CustomerOrdersPageProps {
  api: CustomerOrderApi;
  cityCode: CityCode;
  orderIds: string[];
}

export function CustomerOrdersPage({ api, cityCode, orderIds }: CustomerOrdersPageProps) {
  const binding = createCustomerUiBinding({
    route: "orders",
    cityCode,
    hasOrderIds: orderIds.length > 0,
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderIds.length === 0) {
      setOrders([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          orderIds.map((orderId) => api.getOrder(orderId).then((item) => item.order)),
        );
        if (!cancelled) {
          setOrders(results);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load orders failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [api, orderIds]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [orders]);

  return (
    <CustomerOrdersTemplate route="/customer/orders" cityCode={cityCode} binding={binding}>
      {loading && <LoadingState title="Loading latest orders" description="Reading order API..." />}
      {error && (
        <ErrorState title="Load orders failed" description={error} />
      )}
      {!loading && !error && orders.length === 0 && <EmptyState title="No order yet" description="Create an order first on /customer/order/create." />}
      {!loading &&
        !error &&
        orders.length > 0 &&
        sortedOrders.map((order) => (
          <OrderCard
            key={order.orderId}
            title={order.skuName}
            description={`Quantity ${order.quantity}${order.unit}`}
            meta={`${order.createdAt} · ${order.cityCode}`}
            status={<StatusTag tone={order.status === "paid" ? "success" : order.status === "pending_payment" ? "warning" : "muted"}>{order.status}</StatusTag>}
            priceText={`¥${order.totalAmount}`}
          />
        ))}

      <CustomerAnswerCard state={binding.state} />
      <UatDebugPanel
        binding={binding}
        facts={[
          { label: "city_code", value: cityCode },
          { label: "order ids", value: orderIds },
          { label: "order list count", value: orders.length },
          { label: "workflow state", value: binding.state },
        ]}
      />
    </CustomerOrdersTemplate>
  );
}
