import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import { ensureHangzhouWorkerEligible, workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";
import {
  createCompletedFulfillment,
  ledgerOperatorHeaders,
  runLedgerOnce,
  withLedgerTestLock,
} from "./helpers/ledgerTestHelper.js";

const operatorHeaders = {
  ...ledgerOperatorHeaders,
  "x-xlb-user-id": "operator-hangzhou",
};

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "worker withdrawal state machine",
  { timeout: 60000 },
  () => {
    it("creates, reviews, lists, and marks worker withdrawal requests", () =>
      withLedgerTestLock(async () => {
        await runMigrations();
        await ensureHangzhouWorkerEligible();
        const app = await buildApp();
        try {
          await createCompletedFulfillment(app);
          const ledger = await runLedgerOnce(app);
          expect(ledger.statusCode).toBe(200);

          const balanceResponse = await app.inject({
            method: "GET",
            url: "/api/worker/finance/balance",
            headers: workerHangzhouHeaders,
          });
          expect(balanceResponse.statusCode).toBe(200);
          const preBalance = balanceResponse.json().balance as {
            availableAmount: number;
            requestedWithdrawalAmount: number;
            markedPaidAmount: number;
          };
          expect(preBalance.availableAmount).toBeGreaterThanOrEqual(1);

          const bankResponse = await app.inject({
            method: "POST",
            url: "/api/worker/bank-accounts",
            headers: workerHangzhouHeaders,
            payload: {
              accountHolder: "Demo Worker",
              bankName: "Internal Test Bank",
              bankBranch: "Hangzhou",
              bankCardNumber: "6222 0000 0000 1234",
            },
          });
          expect(bankResponse.statusCode).toBe(200);
          const bankAccountId = bankResponse.json().bankAccount.bankAccountId as string;
          const requestKey = `worker-withdrawal-state-machine-${Date.now()}`;

          const requestResponse = await app.inject({
            method: "POST",
            url: "/api/worker/withdrawal-requests",
            headers: workerHangzhouHeaders,
            payload: {
              bankAccountId,
              amount: 1,
              requestNote: "integration state machine",
              idempotencyKey: requestKey,
            },
          });
          expect(requestResponse.statusCode).toBe(200);
          const requested = requestResponse.json() as {
            withdrawal: { withdrawalId: string; status: string };
            balance: {
              availableAmount: number;
              requestedWithdrawalAmount: number;
              markedPaidAmount: number;
            };
          };
          expect(requested.withdrawal.status).toBe("requested");
          expect(requested.balance.availableAmount).toBeCloseTo(preBalance.availableAmount - 1, 2);
          expect(requested.balance.requestedWithdrawalAmount).toBeCloseTo(
            preBalance.requestedWithdrawalAmount + 1,
            2,
          );

          const replayResponse = await app.inject({
            method: "POST",
            url: "/api/worker/withdrawal-requests",
            headers: workerHangzhouHeaders,
            payload: {
              bankAccountId,
              amount: 1,
              requestNote: "integration state machine",
              idempotencyKey: requestKey,
            },
          });
          expect(replayResponse.statusCode).toBe(200);
          expect(replayResponse.json()).toMatchObject({
            idempotent: true,
            withdrawal: { withdrawalId: requested.withdrawal.withdrawalId },
          });

          const conflictingReplay = await app.inject({
            method: "POST",
            url: "/api/worker/withdrawal-requests",
            headers: workerHangzhouHeaders,
            payload: {
              bankAccountId,
              amount: 2,
              requestNote: "integration state machine",
              idempotencyKey: requestKey,
            },
          });
          expect(conflictingReplay.statusCode).toBe(409);

          const listResponse = await app.inject({
            method: "GET",
            url: "/api/internal/worker-withdrawals",
            headers: operatorHeaders,
          });
          expect(listResponse.statusCode).toBe(200);
          expect(
            (listResponse.json().withdrawals as Array<{ withdrawalId: string }>).some(
              (item) => item.withdrawalId === requested.withdrawal.withdrawalId,
            ),
          ).toBe(true);

          const approveResponse = await app.inject({
            method: "POST",
            url: `/api/internal/worker-withdrawals/${requested.withdrawal.withdrawalId}/review`,
            headers: operatorHeaders,
            payload: { decision: "approved", reviewNote: "ok" },
          });
          expect(approveResponse.statusCode).toBe(200);
          expect(approveResponse.json()).toMatchObject({
            idempotent: false,
            withdrawal: {
              status: "approved",
              reviewedByAdminId: "operator-hangzhou",
            },
          });

          const approveAgainResponse = await app.inject({
            method: "POST",
            url: `/api/internal/worker-withdrawals/${requested.withdrawal.withdrawalId}/review`,
            headers: operatorHeaders,
            payload: { decision: "approved" },
          });
          expect(approveAgainResponse.statusCode).toBe(200);
          expect(approveAgainResponse.json()).toMatchObject({
            idempotent: true,
            withdrawal: { status: "approved" },
          });

          const markResponse = await app.inject({
            method: "POST",
            url: `/api/internal/worker-withdrawals/${requested.withdrawal.withdrawalId}/mark-paid`,
            headers: operatorHeaders,
            payload: { markedPaidNote: "manual internal mark" },
          });
          expect(markResponse.statusCode).toBe(200);
          expect(markResponse.json()).toMatchObject({
            idempotent: false,
            withdrawal: {
              status: "marked_paid",
              markedPaidByAdminId: "operator-hangzhou",
            },
          });
          expect(markResponse.json().balance.requestedWithdrawalAmount).toBeCloseTo(
            preBalance.requestedWithdrawalAmount,
            2,
          );
          expect(markResponse.json().balance.markedPaidAmount).toBeCloseTo(
            preBalance.markedPaidAmount + 1,
            2,
          );

          const concurrentAmount = Number(
            Number(markResponse.json().balance.availableAmount).toFixed(2),
          );
          expect(concurrentAmount).toBeGreaterThan(0);
          const concurrentKeyBase = `worker-withdrawal-concurrency-${Date.now()}`;
          const concurrentResponses = await Promise.all([
            app.inject({
              method: "POST",
              url: "/api/worker/withdrawal-requests",
              headers: workerHangzhouHeaders,
              payload: {
                bankAccountId,
                amount: concurrentAmount,
                requestNote: "concurrency overspend probe",
                idempotencyKey: `${concurrentKeyBase}-a`,
              },
            }),
            app.inject({
              method: "POST",
              url: "/api/worker/withdrawal-requests",
              headers: workerHangzhouHeaders,
              payload: {
                bankAccountId,
                amount: concurrentAmount,
                requestNote: "concurrency overspend probe",
                idempotencyKey: `${concurrentKeyBase}-b`,
              },
            }),
          ]);
          expect(concurrentResponses.map((response) => response.statusCode).sort()).toEqual([
            200,
            409,
          ]);

          const postConcurrencyBalance = await app.inject({
            method: "GET",
            url: "/api/worker/finance/balance",
            headers: workerHangzhouHeaders,
          });
          expect(postConcurrencyBalance.statusCode).toBe(200);
          expect(postConcurrencyBalance.json().balance.availableAmount).toBeCloseTo(0, 2);
          expect(
            postConcurrencyBalance.json().balance.requestedWithdrawalAmount,
          ).toBeCloseTo(preBalance.requestedWithdrawalAmount + concurrentAmount, 2);
        } finally {
          await app.close();
        }
      }));
  },
);
