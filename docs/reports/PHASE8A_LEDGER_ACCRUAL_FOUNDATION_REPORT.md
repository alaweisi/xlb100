# Phase 8A Ledger Accrual Foundation Report

Phase 8A is limited to city-scoped accruals generated from pending
`fulfillment.completed` outbox events. It contains no settlement, payout,
withdrawal, refund, aftersale, reversal, or upstream state mutation.

## Verification

- Migration `012_ledger_accrual_foundation` applied; all seeds passed.
- Build, typecheck, preflight, and all six Phase 8A gates passed.
- Full suite: 142 files passed, 276 tests passed, 1 existing todo.
- Live order: `ord_mr55lxyd_97d2c022`
- Live payment: `pay_mr55lxyv_af96b89d`
- Live fulfillment: `ful_mr55ly0t_72c0b594`
- Live source event: `evt_mr55ly1l_97ef0712`
- Live accrual: `lar_mr55lyb2_6251206a`
- First live run processed 1; immediate retry processed 0.
- Accrual: Hangzhou, gross 89.00, platform fee 8.90, worker receivable
  80.10, CNY, accrued.
- Entries: customer debit 89.00, platform credit 8.90, worker credit 80.10.
- Source event changed from pending to published.
- Order/payment/fulfillment remained paid/paid/completed.
