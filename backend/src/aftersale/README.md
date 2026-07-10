# Aftersale Backend Module

The Phase 17 aftersale module implements city-scoped complaint operations while preserving the earlier refund-request module.

## Components

- `case/aftersaleCaseRoutes.ts` - customer, admin, and worker HTTP routes.
- `case/aftersaleCaseService.ts` - ownership, state transition, idempotency, and execution-boundary rules.
- `case/aftersaleCaseRepository.ts` - city-scoped persistence and timeline writes.
- `case/aftersaleStateMachines.ts` - complaint, repair, and compensation-intent state machines.
- `refund/` - existing refund/reversal foundation; Phase 17 compensation intents do not invoke it.

## Registration

`aftersaleModule.ts` registers the existing refund routes and the Phase 17 case routes. All routes require a city-bearing `RequestContext` and the correct application role.

## Boundaries

- Compensation approval persists `providerExecutionStatus = not_executed`.
- Liability decisions are immutable.
- Workers can mutate only their assigned repairs.
- No payment, provider refund, ledger, settlement, payout, or dispatch-assignment execution is performed by this module.
