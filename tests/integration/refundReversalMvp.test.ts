import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
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
    it("emits refund.approved and creates three audited reversal ledger entries", () =>
      withLedgerTestLock(async () => {
        await ensureHangzhouWorkerEligible();
        const app = await buildApp();
        try {
          const { fulfillmentId, orderId } = await createCompletedFulfillment(app);
          await runLedgerOnce(app);

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

          const approvalResponse = await app.inject({
            method: "POST",
            url: `/api/internal/aftersale/refunds/${refund.refundId}/approve`,
            headers: ledgerOperatorHeaders,
            payload: { approvedByAdminId: "admin-phase14r" },
          });
          expect(approvalResponse.statusCode).toBe(200);
          expect(approvalResponse.json().refund.status).toBe("approved");

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

          const reversalResponse = await app.inject({
            method: "POST",
            url: "/api/internal/ledger/reverse",
            headers: ledgerOperatorHeaders,
            payload: {},
          });
          expect(reversalResponse.statusCode).toBe(200);
          expect(reversalResponse.json().processed).toBeGreaterThanOrEqual(1);

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
        } finally {
          await app.close();
        }
      }));
  },
);
