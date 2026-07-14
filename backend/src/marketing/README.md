# Phase 29 Marketing / Coupon

This directory is the sole backend writer for Marketing campaigns, immutable rule revisions,
coupon definitions/grants, discount decisions, reservations, redemptions, compensation facts,
and Marketing audit evidence.

Hard boundaries:

- money is integer CNY fen; Customer requests never supply price, rule, currency, discount, or net;
- `Campaign.discountRuleId` is not read or executed;
- Pricing is locked/read as canonical input; Order remains the final snapshot/total writer;
- enterprise agreement pricing and coupons are mutually exclusive;
- no direct Payment, Refund, Ledger, Settlement, Dispatch, Review, or Reputation write;
- no subscriber activation, seed, replay, backfill, scheduler, or Provider execution.

Order integration uses one existing MySQL transaction:

1. call `findAcceptedOrderReplay` before allocating a new Order ID;
2. call `prepareDecisionForOrder` to lock and revalidate the decision, rule hash, exact public
   Pricing version/gross, SKU, quantity, expiry, and stored fingerprint;
3. insert the canonical Order and immutable snapshot with the prepared reservation/redemption IDs;
4. call `commitPreparedDecisionAcceptance` before committing the transaction.

Any failure must roll back the complete shared transaction.
