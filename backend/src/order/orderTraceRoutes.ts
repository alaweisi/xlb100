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
  dispatch_last_reason: string | null;
  dispatch_updated_at: NullableDate;
  fulfillment_id: string | null;
  worker_id: string | null;
  fulfillment_status: string | null;
  started_at: NullableDate;
  completed_at: NullableDate;
  fulfillment_updated_at: NullableDate;
  review_id: string | null;
  review_status: string | null;
  review_rating: number | null;
  review_comment: string | null;
  review_created_at: NullableDate;
  refund_id: string | null;
  refund_status: string | null;
  refund_amount: string | null;
  refund_currency: string | null;
  refund_reason: string | null;
  requested_at: NullableDate;
  approved_at: NullableDate;
};

type DispatchTimelineRow = RowDataPacket & {
  dispatch_event_id: string;
  event_type: string;
  worker_id: string | null;
  reason: string | null;
  created_at: Date;
};

type ReverseTraceRow = RowDataPacket & {
  reverse_request_id: string; reverse_type: string; status: string; reason: string;
  requested_scheduled_at: Date | null; requested_time_slot: string | null;
  review_note: string | null; created_at: Date; applied_at: Date | null;
};
type ComplaintTraceRow = RowDataPacket & {
  complaint_id: string; category: string; priority: string; status: string;
  description: string; resolution_type: string | null; resolution_note: string | null;
  submitted_at: Date; resolved_at: Date | null; closed_at: Date | null;
};
type AftersaleTimelineTraceRow = RowDataPacket & {
  timeline_event_id: string; event_type: string; actor_type: string;
  actor_id: string | null; content: string; created_at: Date;
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
                dt.last_reason AS dispatch_last_reason,
                dt.updated_at AS dispatch_updated_at,
                f.fulfillment_id,
                f.worker_id,
                f.status AS fulfillment_status,
                f.started_at,
                f.completed_at,
                f.updated_at AS fulfillment_updated_at,
                rev.review_id,
                rev.status AS review_status,
                rev.rating AS review_rating,
                rev.comment AS review_comment,
                rev.created_at AS review_created_at,
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
           LEFT JOIN order_reviews rev
             ON rev.city_code = o.city_code
            AND rev.order_id = o.order_id
          WHERE o.city_code = ?
            AND o.order_id = ?
          ORDER BY p.created_at DESC,
                   dt.created_at DESC,
                   f.created_at DESC,
                   rev.created_at DESC,
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

      const dispatchTimeline = row.dispatch_task_id
        ? await getMysqlPool().query<DispatchTimelineRow[]>(
            `SELECT dispatch_event_id, event_type, worker_id, reason, created_at
               FROM dispatch_events
              WHERE city_code = ?
                AND dispatch_task_id = ?
              ORDER BY created_at ASC, dispatch_event_id ASC`,
            [cityCode, row.dispatch_task_id],
          )
        : null;
      const dispatchEvents = dispatchTimeline
        ? dispatchTimeline[0].map((event) => ({
            dispatchEventId: event.dispatch_event_id,
            eventType: event.event_type,
            workerId: event.worker_id,
            reason: event.reason,
            createdAt: event.created_at.toISOString(),
          }))
        : [];
      const [reverseResult, complaintResult, aftersaleTimelineResult] = await Promise.all([
        getMysqlPool().query<ReverseTraceRow[]>(
          `SELECT reverse_request_id, reverse_type, status, reason, requested_scheduled_at,
                  requested_time_slot, review_note, created_at, applied_at
             FROM order_reverse_requests
            WHERE city_code=? AND order_id=?
            ORDER BY created_at ASC`,
          [cityCode, orderId],
        ),
        getMysqlPool().query<ComplaintTraceRow[]>(
          `SELECT complaint_id, category, priority, status, description, resolution_type,
                  resolution_note, submitted_at, resolved_at, closed_at
             FROM aftersale_complaints
            WHERE city_code=? AND order_id=?
            ORDER BY submitted_at ASC`,
          [cityCode, orderId],
        ),
        getMysqlPool().query<AftersaleTimelineTraceRow[]>(
          `SELECT timeline_event_id, event_type, actor_type, actor_id, content, created_at
             FROM aftersale_timeline_events
            WHERE city_code=? AND order_id=?
            ORDER BY created_at ASC, timeline_event_id ASC`,
          [cityCode, orderId],
        ),
      ]);

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
                customerMessage: row.dispatch_last_reason,
                updatedAt: iso(row.dispatch_updated_at),
                timeline: dispatchEvents,
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
          review: row.review_id
            ? {
                reviewId: row.review_id,
                status: row.review_status,
                rating: Number(row.review_rating),
                comment: row.review_comment,
                createdAt: iso(row.review_created_at),
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
          phase17Aftersale: {
            reverseRequests: reverseResult[0].map((item) => ({
              reverseRequestId: item.reverse_request_id,
              reverseType: item.reverse_type,
              status: item.status,
              reason: item.reason,
              requestedScheduledAt: iso(item.requested_scheduled_at),
              requestedTimeSlot: item.requested_time_slot,
              reviewNote: item.review_note,
              createdAt: item.created_at.toISOString(),
              appliedAt: iso(item.applied_at),
            })),
            complaints: complaintResult[0].map((item) => ({
              complaintId: item.complaint_id,
              category: item.category,
              priority: item.priority,
              status: item.status,
              description: item.description,
              resolutionType: item.resolution_type,
              resolutionNote: item.resolution_note,
              submittedAt: item.submitted_at.toISOString(),
              resolvedAt: iso(item.resolved_at),
              closedAt: iso(item.closed_at),
            })),
            timeline: aftersaleTimelineResult[0].map((item) => ({
              timelineEventId: item.timeline_event_id,
              eventType: item.event_type,
              actorType: item.actor_type,
              actorId: item.actor_id,
              content: item.content,
              createdAt: item.created_at.toISOString(),
            })),
          },
        },
      };
    },
  );
}
