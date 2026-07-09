import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import {
  createCompletedFulfillment,
  ledgerOperatorHeaders,
  runLedgerOnce,
  withLedgerTestLock,
} from "./helpers/ledgerTestHelper.js";
import { customerHeaders } from "./helpers/dispatchTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "refund approval to ledger reversal",
  { timeout: 60000 },
  () => {
    it("emits refund.approved, creates reversal entries, adjusts worker receivable, and stays idempotent", () =>
      withLedgerTestLock(async () => {
        await runMigrations();
        await ensureHangzhouWorkerEligible();
        const app = await buildApp();
        try {
          const { fulfillmentId, orderId } = await createCompletedFulfillment(app);
          await runLedgerOnce(app);
          const [preBalances] = await getMysqlPool().query<
            (RowDataPacket & {
              accrued_amount: string;
              adjusted_amount: string;
              requested_withdrawal_amount: string;
              marked_paid_amount: string;
              available_amount: string;
            })[]
          >(
            `SELECT accrued_amount, adjusted_amount, requested_withdrawal_amount,
                    marked_paid_amount, available_amount
               FROM worker_receivable_balances
              WHERE city_code = 'hangzhou'
                AND worker_id = 'worker-demo-hangzhou'`,
          );
          expect(preBalances).toHaveLength(1);
          const preBalance = preBalances[0]!;

          const reviewResponse = await app.inject({
            method: "POST",
            url: `/api/orders/${orderId}/reviews`,
            headers: customerHeaders,
            payload: {
              rating: 5,
              comment: "Stage 6 simulated full-flow review",
            },
          });
          expect(reviewResponse.statusCode).toBe(200);
          const review = reviewResponse.json().review as {
            reviewId: string;
            status: string;
            workerId: string;
            rating: number;
          };
          expect(review).toMatchObject({
            status: "created",
            workerId: "worker-demo-hangzhou",
            rating: 5,
          });

          const refundResponse = await app.inject({
            method: "POST",
            url: "/api/aftersale/refunds",
            headers: customerHeaders,
            payload: { orderId, reason: "Phase 14R integration refund" },
          });
          expect(refundResponse.statusCode).toBe(200);
          const refund = refundResponse.json().refund as {
            refundId: string;
            status: string;
            amount: number;
          };
          expect(refund.status).toBe("requested");
          expect(refund.amount).toBe(89);

          const traceResponse = await app.inject({
            method: "GET",
            url: `/api/internal/admin/order-traces/${orderId}`,
            headers: ledgerOperatorHeaders,
          });
          expect(traceResponse.statusCode).toBe(200);
          expect(traceResponse.json().trace).toMatchObject({
            order: { orderId, customerId: "customer-dispatch-001", status: "paid" },
            payment: { status: "paid" },
            dispatch: { status: "completed" },
            fulfillment: {
              fulfillmentId,
              workerId: "worker-demo-hangzhou",
              status: "completed",
            },
            review: { reviewId: review.reviewId, status: "created", rating: 5 },
            aftersale: { refundId: refund.refundId, status: "requested" },
          });

          const approvalResponse = await app.inject({
            method: "POST",
            url: `/api/internal/aftersale/refunds/${refund.refundId}/approve`,
            headers: ledgerOperatorHeaders,
            payload: { approvedByAdminId: "admin-phase14r" },
          });
          expect(approvalResponse.statusCode).toBe(200);
          expect(approvalResponse.json().refund.status).toBe("approved");

          const approvedTraceResponse = await app.inject({
            method: "GET",
            url: `/api/internal/admin/order-traces/${orderId}`,
            headers: ledgerOperatorHeaders,
          });
          expect(approvedTraceResponse.statusCode).toBe(200);
          expect(approvedTraceResponse.json().trace).toMatchObject({
            review: { reviewId: review.reviewId, status: "created", rating: 5 },
            aftersale: { refundId: refund.refundId, status: "approved" },
          });

          const [preReverseEntries] = await getMysqlPool().query<RowDataPacket[]>(
            `SELECT entry_id
               FROM ledger_entries
              WHERE city_code = 'hangzhou'
                AND source_type = 'refund.approved'
                AND source_id = ?`,
            [fulfillmentId],
          );
          expect(preReverseEntries).toHaveLength(0);
          const [preAdjustmentRows] = await getMysqlPool().query<RowDataPacket[]>(
            `SELECT adjustment_id
               FROM worker_receivable_adjustments
              WHERE city_code = 'hangzhou'
                AND refund_id = ?`,
            [refund.refundId],
          );
          expect(preAdjustmentRows).toHaveLength(0);

          const [refundEvents] = await getMysqlPool().query<
            (RowDataPacket & { event_id: string; status: string })[]
          >(
            `SELECT event_id, status
               FROM event_outbox
              WHERE event_type = 'refund.approved'
                AND aggregate_id = ?
                AND city_code = 'hangzhou'`,
            [refund.refundId],
          );
          expect(refundEvents).toHaveLength(1);
          expect(refundEvents[0]!.status).toBe("pending");

          const reversalResponse = await runLedgerOnce(app);
          expect(reversalResponse.statusCode).toBe(200);
          expect(reversalResponse.json().processed).toBeGreaterThanOrEqual(1);

          const idempotentResponse = await runLedgerOnce(app);
          expect(idempotentResponse.statusCode).toBe(200);
          expect(idempotentResponse.json().processed).toBe(0);

          const [entries] = await getMysqlPool().query<
            (RowDataPacket & {
              entry_id: string;
              account_type: string;
              direction: string;
              amount: string;
            })[]
          >(
            `SELECT entry_id, account_type, direction, amount
               FROM ledger_entries
              WHERE city_code = 'hangzhou'
                AND source_type = 'refund.approved'
                AND source_id = ?
              ORDER BY account_type ASC`,
            [fulfillmentId],
          );
          expect(entries).toHaveLength(3);
          expect(
            Object.fromEntries(
              entries.map((entry) => [
                entry.account_type,
                `${entry.direction}:${entry.amount}`,
              ]),
            ),
          ).toEqual({
            customer: "credit:89.00",
            platform: "debit:8.90",
            worker: "debit:80.10",
          });

          const [adjustments] = await getMysqlPool().query<
            (RowDataPacket & {
              refund_id: string;
              source_event_id: string;
              gross_adjustment: string;
              platform_fee_adjustment: string;
              worker_receivable_adjustment: string;
            })[]
          >(
            `SELECT refund_id, source_event_id, gross_adjustment,
                    platform_fee_adjustment, worker_receivable_adjustment
               FROM worker_receivable_adjustments
              WHERE city_code = 'hangzhou'
                AND refund_id = ?`,
            [refund.refundId],
          );
          expect(adjustments).toHaveLength(1);
          expect(adjustments[0]).toMatchObject({
            refund_id: refund.refundId,
            source_event_id: refundEvents[0]!.event_id,
            gross_adjustment: "-89.00",
            platform_fee_adjustment: "-8.90",
            worker_receivable_adjustment: "-80.10",
          });

          const [balances] = await getMysqlPool().query<
            (RowDataPacket & {
              accrued_amount: string;
              adjusted_amount: string;
              requested_withdrawal_amount: string;
              marked_paid_amount: string;
              available_amount: string;
            })[]
          >(
            `SELECT accrued_amount, adjusted_amount, requested_withdrawal_amount,
                    marked_paid_amount, available_amount
               FROM worker_receivable_balances
              WHERE city_code = 'hangzhou'
                AND worker_id = 'worker-demo-hangzhou'`,
          );
          expect(balances).toHaveLength(1);
          expect(Number(balances[0]!.accrued_amount)).toBeCloseTo(
            Number(preBalance.accrued_amount),
            2,
          );
          expect(Number(balances[0]!.adjusted_amount)).toBeCloseTo(
            Number(preBalance.adjusted_amount) - 80.1,
            2,
          );
          expect(Number(balances[0]!.requested_withdrawal_amount)).toBeCloseTo(
            Number(preBalance.requested_withdrawal_amount),
            2,
          );
          expect(Number(balances[0]!.marked_paid_amount)).toBeCloseTo(
            Number(preBalance.marked_paid_amount),
            2,
          );
          expect(Number(balances[0]!.available_amount)).toBeCloseTo(
            Number(preBalance.available_amount) - 80.1,
            2,
          );

          const [accruals] = await getMysqlPool().query<
            (RowDataPacket & { status: string })[]
          >(
            `SELECT status
               FROM ledger_accruals
              WHERE city_code = 'hangzhou'
                AND fulfillment_id = ?`,
            [fulfillmentId],
          );
          expect(accruals[0]!.status).toBe("voided");

          const [audits] = await getMysqlPool().query<RowDataPacket[]>(
            `SELECT eo.event_id
               FROM event_outbox eo
               JOIN ledger_entries le
                 ON le.entry_id = eo.aggregate_id
                AND le.city_code = eo.city_code
              WHERE eo.event_type = 'conflict_audit'
                AND eo.aggregate_type = 'ledger_entry'
                AND le.source_type = 'refund.approved'
                AND le.source_id = ?`,
            [fulfillmentId],
          );
          expect(audits).toHaveLength(3);

          const [publishedEvents] = await getMysqlPool().query<
            (RowDataPacket & { status: string; published_at: Date | null })[]
          >(
            `SELECT status, published_at
               FROM event_outbox
              WHERE event_type = 'refund.approved'
                AND aggregate_id = ?
                AND city_code = 'hangzhou'`,
            [refund.refundId],
          );
          expect(publishedEvents[0]!.status).toBe("published");
          expect(publishedEvents[0]!.published_at).toBeTruthy();

          const [entryCount] = await getMysqlPool().query<
            (RowDataPacket & { count: number })[]
          >(
            `SELECT COUNT(*) AS count
               FROM ledger_entries
              WHERE city_code = 'hangzhou'
                AND source_type = 'refund.approved'
                AND source_id = ?`,
            [fulfillmentId],
          );
          const [adjustmentCount] = await getMysqlPool().query<
            (RowDataPacket & { count: number })[]
          >(
            `SELECT COUNT(*) AS count
               FROM worker_receivable_adjustments
              WHERE city_code = 'hangzhou'
                AND refund_id = ?`,
            [refund.refundId],
          );
          expect(Number(entryCount[0]!.count)).toBe(3);
          expect(Number(adjustmentCount[0]!.count)).toBe(1);
        } finally {
          await app.close();
        }
      }));
  },
);
