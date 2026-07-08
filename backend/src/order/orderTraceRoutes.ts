import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";

type NullableDate = Date | null;

type OrderTraceRow = RowDataPacket & {
  order_id: string;
  city_code: string;
  customer_id: string;
  sku_id: string;
  sku_name: string;
  order_status: string;
  total_amount: string;
  order_currency: string;
  order_created_at: Date;
  payment_order_id: string | null;
  payment_status: string | null;
  payment_amount: string | null;
  payment_currency: string | null;
  payment_provider: string | null;
  payment_updated_at: NullableDate;
  dispatch_task_id: string | null;
  dispatch_status: string | null;
  dispatch_updated_at: NullableDate;
  fulfillment_id: string | null;
  worker_id: string | null;
  fulfillment_status: string | null;
  started_at: NullableDate;
  completed_at: NullableDate;
  fulfillment_updated_at: NullableDate;
  refund_id: string | null;
  refund_status: string | null;
  refund_amount: string | null;
  refund_currency: string | null;
  refund_reason: string | null;
  requested_at: NullableDate;
  approved_at: NullableDate;
};

function iso(value: NullableDate | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function registerOrderTraceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/internal/admin/order-traces/:orderId",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }
      if (context.appType !== "admin" || context.role !== "operator") {
        return reply.status(403).send({
          ok: false,
          error: "order trace requires admin app with operator role",
        });
      }

      const { orderId } = request.params as { orderId: string };
      const cityCode = context.cityCode;
      if (!cityCode) {
        return reply.status(400).send({ ok: false, error: "city_code is required" });
      }

      const [rows] = await getMysqlPool().query<OrderTraceRow[]>(
        `SELECT o.order_id,
                o.city_code,
                o.customer_id,
                o.sku_id,
                o.sku_name,
                o.status AS order_status,
                o.total_amount,
                o.currency AS order_currency,
                o.created_at AS order_created_at,
                p.payment_order_id,
                p.status AS payment_status,
                p.amount AS payment_amount,
                p.currency AS payment_currency,
                p.provider AS payment_provider,
                p.updated_at AS payment_updated_at,
                dt.dispatch_task_id,
                dt.status AS dispatch_status,
                dt.updated_at AS dispatch_updated_at,
                f.fulfillment_id,
                f.worker_id,
                f.status AS fulfillment_status,
                f.started_at,
                f.completed_at,
                f.updated_at AS fulfillment_updated_at,
                rr.refund_id,
                rr.status AS refund_status,
                rr.amount AS refund_amount,
                rr.currency AS refund_currency,
                rr.reason AS refund_reason,
                rr.requested_at,
                rr.approved_at
           FROM orders o
           LEFT JOIN payment_orders p
             ON p.city_code = o.city_code
            AND p.order_id = o.order_id
           LEFT JOIN dispatch_tasks dt
             ON dt.city_code = o.city_code
            AND dt.order_id = o.order_id
           LEFT JOIN fulfillments f
             ON f.city_code = o.city_code
            AND f.order_id = o.order_id
           LEFT JOIN aftersale_refund_requests rr
             ON rr.city_code = o.city_code
            AND rr.order_id = o.order_id
          WHERE o.city_code = ?
            AND o.order_id = ?
          ORDER BY p.created_at DESC,
                   dt.created_at DESC,
                   f.created_at DESC,
                   rr.requested_at DESC
          LIMIT 1`,
        [cityCode, orderId],
      );

      const row = rows[0];
      if (!row) {
        return reply.status(404).send({
          ok: false,
          error: `Order trace not found: ${orderId}`,
        });
      }

      return {
        ok: true,
        trace: {
          order: {
            orderId: row.order_id,
            cityCode: row.city_code,
            customerId: row.customer_id,
            skuId: row.sku_id,
            skuName: row.sku_name,
            status: row.order_status,
            totalAmount: Number(row.total_amount),
            currency: row.order_currency,
            createdAt: row.order_created_at.toISOString(),
          },
          payment: row.payment_order_id
            ? {
                paymentOrderId: row.payment_order_id,
                status: row.payment_status,
                amount: Number(row.payment_amount),
                currency: row.payment_currency,
                provider: row.payment_provider,
                updatedAt: iso(row.payment_updated_at),
              }
            : null,
          dispatch: row.dispatch_task_id
            ? {
                dispatchTaskId: row.dispatch_task_id,
                status: row.dispatch_status,
                updatedAt: iso(row.dispatch_updated_at),
              }
            : null,
          fulfillment: row.fulfillment_id
            ? {
                fulfillmentId: row.fulfillment_id,
                workerId: row.worker_id,
                status: row.fulfillment_status,
                startedAt: iso(row.started_at),
                completedAt: iso(row.completed_at),
                updatedAt: iso(row.fulfillment_updated_at),
              }
            : null,
          aftersale: row.refund_id
            ? {
                refundId: row.refund_id,
                status: row.refund_status,
                amount: Number(row.refund_amount),
                currency: row.refund_currency,
                reason: row.refund_reason,
                requestedAt: iso(row.requested_at),
                approvedAt: iso(row.approved_at),
              }
            : null,
        },
      };
    },
  );
}
