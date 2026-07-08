# P1 worker task-pool ordering addendum

Date: 2026-07-08

## Scope

This addendum records the small ordering fix completed before P1 Stage 2. The change is intentionally narrow: make newly created queued tasks visible at the top of the worker task pool.

No API response shape was changed. No pagination parameter was added. The following files were intentionally left untouched:

- `backend/src/worker/taskPoolService.ts`
- `backend/src/worker/taskPoolRoutes.ts`
- `packages/types`
- `packages/api-client`

## Change

Updated `backend/src/dispatch/dispatchRepository.ts` in `listQueuedTasks()`:

```sql
ORDER BY created_at DESC, dispatch_task_id DESC
```

The previous ordering was `created_at ASC`. With the fixed `LIMIT 100`, a local database with more than 100 historical queued tasks could hide newly generated work from the first page of the task pool.

The secondary `dispatch_task_id DESC` sort keeps ordering stable when multiple tasks share the same `created_at` value.

## Test Coverage

Updated `tests/integration/workerTaskPoolApi.test.ts` with a regression test:

- `returns newest queued task first`

The test creates two paid orders, dispatches them, sets deterministic `created_at` values, and asserts that the newer queued dispatch task appears first in `GET /api/worker/task-pool`.

## Verification

- `pnpm exec vitest run tests/integration/workerTaskPoolApi.test.ts --pool=forks --poolOptions.forks.singleFork`
  - Passed: 1 file, 6 tests
- `pnpm turbo run typecheck`
  - Passed: 17 successful, 17 total
- `pnpm turbo run build`
  - Passed: 11 successful, 11 total
- `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork`
  - Passed: 255 files
  - Tests: 1049 passed, 1 todo, 1050 total

## Follow-up

### P1 follow-up: define worker task-pool ordering/pagination before enabling accept UAT

Status: latest-first default ordering is resolved. Full task-pool pagination, filtering, and distance or priority ordering remain TODO and should be designed separately before expanding accept UAT beyond the minimal demo path.
