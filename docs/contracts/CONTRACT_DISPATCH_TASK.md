# CONTRACT_DISPATCH_TASK

## Entity: DispatchTask

| Field | Type | Required |
|-------|------|----------|
| dispatchTaskId | string | yes |
| cityCode | CityCode | yes |
| orderId | string | yes |
| customerId | string | yes |
| skuId | string | yes |
| amount | number | yes |
| sourceEventId | string | yes (outbox event_id) |
| streamName | string | yes |
| streamEntryId | string \| null | set after XADD |
| status | pending \| queued \| failed \| cancelled | yes |

## Uniqueness

- One task per `source_event_id` (outbox event)
- One task per `order_id`

## Status flow (Phase 5A)

```
pending → queued | failed
```

## Forbidden in Phase 5A

- `workerId` / `assignedWorkerId` columns
- Worker matching / assignment logic
- Fulfillment / ledger side effects
