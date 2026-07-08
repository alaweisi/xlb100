import { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient, customerApi } from "@xlb/api-client";
import { API_BASE } from "../apiBase";
import { buildHash } from "../hashParams";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";

const ADMIN_DEFAULT_CITY_CODE = "hangzhou";
const USER_ENTERPRISE_ID = "admin-hangzhou";

interface AdminOrder {
  orderId: string;
  cityCode: string;
  customerId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  unit: string;
  status: string;
  totalAmount?: number;
  currency?: string;
  basePrice?: number;
  priceRuleId?: string;
  priceType?: string;
  priceText?: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  onBack: () => void;
  defaultOrderId?: string;
  defaultCityCode?: string;
}

function formatNullable(value: unknown): string {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

export function OrderTraceabilityPage({ onBack, defaultOrderId, defaultCityCode }: Props) {
  const [orderId, setOrderId] = useState(defaultOrderId || "");
  const [cityCode, setCityCode] = useState(defaultCityCode || ADMIN_DEFAULT_CITY_CODE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [rawOrderResponse, setRawOrderResponse] = useState<unknown>(null);
  const [searchedOrderId, setSearchedOrderId] = useState<string | null>(null);

  const apiClient = useMemo(
    () =>
      createApiClient({
        baseUrl: API_BASE,
        headers: {
          "x-xlb-app-type": "admin",
          "x-xlb-role": "operator",
          "x-xlb-city-code": cityCode,
          "x-xlb-user-id": USER_ENTERPRISE_ID,
        },
      }),
    [cityCode],
  );

  const api = useMemo(() => customerApi.forClient(apiClient), [apiClient]);

  const lookup = useCallback(
    async (nextOrderId: string) => {
      const trimmedOrderId = nextOrderId.trim();
      if (!trimmedOrderId) {
        setError("请输入 customer orderId");
        return;
      }

      setLoading(true);
      setError(null);
      setOrder(null);
      setRawOrderResponse(null);
      setSearchedOrderId(trimmedOrderId);

      try {
        const response = await api.getOrder(trimmedOrderId);
        const payload = response.order as AdminOrder;
        setOrder(payload);
        setRawOrderResponse(response);
      } catch (lookupError) {
        setError(lookupError instanceof Error ? lookupError.message : "订单查询失败");
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (defaultOrderId) {
      setOrderId(defaultOrderId);
      void lookup(defaultOrderId);
    }
  }, [defaultOrderId, lookup]);

  useEffect(() => {
    setError(null);
    setOrder(null);
    setSearchedOrderId(null);
    setRawOrderResponse(null);
    setOrderId((defaultOrderId || "").trim());
  }, [cityCode]);

  const handleLookup = useCallback(() => {
    const nextHash = buildHash("/orders", { cityCode, orderId });
    window.location.hash = nextHash;
    void lookup(orderId);
  }, [cityCode, orderId, lookup]);

  const handleCityChange = useCallback((next: string) => {
    setCityCode(next.trim() || ADMIN_DEFAULT_CITY_CODE);
  }, []);

  const statusBadge = order ? (
    <StatusTag tone={order.status === "pending_payment" || order.status === "paid" ? "success" : "warning"}>
      {order.status}
    </StatusTag>
  ) : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="订单追踪"
        actions={
          <>
            <ScopeBadge scope={`城市：${cityCode}`} />
            {statusBadge}
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="城市码" description="按管理员视图设置 scope cityCode（会映射到请求头 x-xlb-city-code）">
            <Input value={cityCode} onChange={(event) => handleCityChange(event.target.value)} />
          </FormField>
          <FormField label="订单 ID" description="输入客户端真实 orderId 后点击查询">
            <Input value={orderId} onChange={(event) => setOrderId(event.target.value)} />
          </FormField>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={handleLookup} variant="primary">查询订单</Button>
            <Button onClick={onBack}>返回控制台</Button>
          </div>
        </div>
      </Card>

      {loading && <LoadingState title="订单读取中" description="基于真实 GET /api/orders/:orderId 获取订单链路主数据" />}

      {error && (
        <ApiErrorPanel
          title="订单查询失败"
          detail={error}
          action={<Button onClick={() => {
            setError(null);
            if (orderId) {
              void lookup(orderId);
            }
          }}>重试</Button>}
        />
      )}

      {!loading && !error && !order && (
        <EmptyState
          title={searchedOrderId ? "未命中订单" : "请输入订单 ID 查询"}
          description={
            searchedOrderId
              ? `未在真实接口返回 orderId=${searchedOrderId} 的记录（请确认 cityCode/orderId 是否正确）`
              : "当前仅展示真实查询结果，不渲染 mock 或假订单"
          }
          action={
            <Button onClick={onBack} disabled={!searchedOrderId}>
              回到控制台
            </Button>
          }
        />
      )}

      {order && (
        <Card title="订单主链路快照" actions={<StatusTag tone="success">真实订单链路</StatusTag>}>
          <Table
            rows={[
              ["orderId", order.orderId],
              ["cityCode", order.cityCode],
              ["customerId", formatNullable(order.customerId)],
              ["skuId", formatNullable(order.skuId)],
              ["skuName", formatNullable(order.skuName)],
              ["quantity", order.quantity],
              ["unit", formatNullable(order.unit)],
              ["status", order.status],
              ["paymentOrderId", "CONTRACT_MISSING: no /api/payments/:orderId read endpoint"],
              ["payment status", "CONTRACT_MISSING: no dedicated payment read endpoint"],
              ["priceRuleId", formatNullable(order.priceRuleId)],
              ["priceType", formatNullable(order.priceType)],
              ["priceText", formatNullable(order.priceText)],
              ["totalAmount", formatNullable(order.totalAmount)],
              ["currency", formatNullable(order.currency)],
              ["basePrice", formatNullable(order.basePrice)],
              ["createdAt", formatNullable(order.createdAt)],
              ["updatedAt", formatNullable(order.updatedAt)],
            ]}
            getRowKey={(row) => String(row[0])}
            columns={[
              { key: "field", title: "字段", render: (row) => row[0], width: 220 },
              {
                key: "value",
                title: "值",
                render: (row) => (typeof row[1] === "string" || typeof row[1] === "number" ? String(row[1]) : JSON.stringify(row[1])),
              },
            ]}
          />
        </Card>
      )}

      {!!rawOrderResponse && (
        <Card title="UAT 证据（可折叠）">
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>查看 /api/orders 返回原文</summary>
            <pre
              style={{
                background: "#0b1020",
                borderRadius: 8,
                color: "#c4d5ff",
                margin: "12px 0 0",
                overflow: "auto",
                padding: 12,
              }}
            >
              {JSON.stringify(rawOrderResponse, null, 2)}
            </pre>
          </details>
        </Card>
      )}
    </div>
  );
}
