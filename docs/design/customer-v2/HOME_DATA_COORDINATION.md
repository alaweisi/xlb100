# Customer Home Data Coordination

> Construction step: P5 data orchestration
>
> Shared contract: `@xlb/types` Customer SDUI v1

## Responsibility

`HomeDataCoordinator` is the only home-runtime layer allowed to resolve manifest
`dataSources`. Bundled business components receive normalized view models by
slot; they do not read `dataRef`, construct API URLs, or call backend services.

```text
validated manifest dataSources
  -> HomeDataAdapterRegistry (closed data-key allowlist)
    -> HomeDataCoordinator
      -> scoped cache / source dedupe / upstream request coalescing
      -> timeout / cancellation / partial failure / stale fallback
        -> existing @xlb/api-client methods or application-owned providers
          -> normalized HomeDataValueByKey view models
```

The coordinator never decides price, authorization, catalog availability,
provider eligibility, order state, or any other business fact.

## Runtime guarantees

- A data adapter can only be registered for a `CustomerSduiDataKey` in the
  shared contract.
- Equal source key/parameter pairs are loaded once per batch, even when several
  manifest source ids reference them.
- Adapters can coalesce different logical data sources onto one upstream read
  through `context.request(key, loader)`.
- Cache entries are partitioned by the caller's opaque `cacheScopeKey`; callers
  must rotate it when city or authenticated actor changes.
- Fresh cache is reused. A bounded stale value can be returned when a refresh
  fails or times out. Caller cancellation never silently revives stale UI.
- One failed or unavailable source produces a partial batch and does not blank
  other home modules.
- Telemetry callbacks are fail-open and never receive response payloads.
- The timeout boundary resolves even if an optional provider fails to observe
  its abort signal.

## Authoritative adapters available now

| Data key | Current source | State |
| --- | --- | --- |
| `customer.current_location` | App-shell city/location provider | Injectable |
| `customer.notification_summary` | Existing Customer notification API | Wired |
| `catalog.service_categories` | Existing Catalog API | Wired |
| `catalog.recommended_services` | No authoritative Customer recommendation API | Explicitly unregistered unless provided |
| `provider.nearby` | No authoritative Customer nearby-provider API | Explicitly unregistered unless provided |
| `content.home_promotions` | No published Customer presentation API | Explicitly unregistered unless provided |
| `content.trust_guarantees` | No governed Customer content provider | Explicitly unregistered unless provided |

Missing domains are not replaced with invented local success data. Step 6 or a
separate business-API unit must provide an authoritative read contract before
their adapters are registered.

## P3/P4 integration seam

P3 resolves each component binding to `{ slot, source }`. P5 returns data keyed
by `source.id`, so the runtime binding resolver can deterministically map:

```text
node.dataBindings[n].source.id
  -> HomeDataBatchResult.results[sourceId]
  -> bindings.data[node.dataBindings[n].slot]
```

Only `success` and `stale` values are injectable. Required missing/error data is
reported to the component host as an unavailable slot; optional failures remain
local. P4 controls manifest delivery and fallback and does not own business-data
cache entries.
