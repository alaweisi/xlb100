# Customer UI v2 — P10 Final Integration and Acceptance

## Verdict

`P10_READY` for the Customer Hybrid SDUI scope.

All current Customer P1–P10 type, build, contract, unit, integration, security,
migration-062, E2E, visual, and pollution gates listed below pass. This is not a
claim that the repository-wide legacy Phase suite is all green or that production
deployment prerequisites are complete.

## Integration baseline

- P10 branch: `codex/customer-ui-v2-p10-final-acceptance`
- Unified baseline: P9 exact commit
  `fafe8130c28ea3f67e72398ae35065267b87493c`
- Verified ancestors:

  | Unit | Commit |
  | --- | --- |
  | P1 | `c348b34f021c76492ba6a68a38a05aa8085e2e7e` |
  | P2 | `2c8c92459f5891780b331fc8106fd8288df47471` |
  | P3 | `c0ee9fde0c8fb6d44a91e07e796b633fd605cc14` |
  | P4 | `49d656cae08bcafcd9b5efaeb26c6ab37e797e89` |
  | P5 | `52462fc95846bc3f5e3044e2218bf7ab33092a8e` |
  | P6 | `b87383d8e4a2d2cacd0c4e27ce0cbc7a9612ca43` |
  | P7 | `187a71cc646313422468b510cd94ca22e032022f` |
  | P8 | `0f7fa01f74adfc12a4df2732c261c89bca3ebff7` |
  | P9 foundation | `be101c835be73ef59903ad75c0091174cb8899f9` |

Each `git merge-base --is-ancestor <commit> HEAD` returned exit code 0 at the P10
start gate.

## P10 integration corrections

- Removed the concrete legacy color from the unmounted Catalog adapter and replaced
  it with the constrained semantic key `customer.color.action`; Catalog mapping
  behavior and fields remain intact.
- Updated the two installed PWA SVG assets to the approved Customer palette.
  Static install assets cannot consume runtime CSS variables, so their small literal
  palette is locked by a pollution test.
- Replaced the obsolete Phase23C Customer `<Suspense>`/lazy-shape assertion with
  equivalent Hybrid SDUI checks: shared App error boundary, explicit Home loading
  state, slot-level error isolation, and the dynamic `HomePage` entry.
- Narrowed the Phase24B deletion assertion to its own protected support tests so an
  intentionally removed legacy Customer UI test cannot block the new architecture.
  No Support API, state, migration, or business logic changed.

## Failure and degradation matrix

| Scenario | Expected boundary | Evidence |
| --- | --- | --- |
| Remote 200 | validated remote Manifest renders | delivery unit + remote browser case |
| HTTP 304 | validated cached envelope reused | real route contract returns 304; transport test reuses cache |
| Invalid Schema | reject remote, use safe fallback | delivery/contract tests |
| Unknown component | isolate unsupported slot | composition tests |
| Slot render crash | one slot fails, page survives | renderer/telemetry integration tests |
| Manifest timeout | abort, count failure, fallback | delivery tests |
| Offline | no transport; LKG then builtin | delivery tests + browser offline case |
| Fresh cache | no unnecessary remote request | delivery tests |
| LKG | bounded stale compatible revision only | delivery tests |
| Builtin | closed local safe page | delivery/E2E |
| Kill Switch | clear LKG; builtin cannot be bypassed | delivery tests + browser case |
| Circuit open/half-open | short-circuit, then bounded probe | delivery tests |
| Invalid theme | fail closed to Customer foundation | presentation tests |
| Logo load/asset failure | keep `xlb100`, recover on new revision | presentation tests |
| Data partial | optional source does not block page | data coordinator tests |
| Data empty | explicit `empty` batch | `customerP10SafetyBoundary` |
| Data error/timeout | bounded error, no raw leakage | data coordinator tests |
| Telemetry sink failure | business action/delivery/data remain live | telemetry + P10 safety tests |
| Queue overflow | bounded oldest-event drop accounting | telemetry foundation tests |
| Sampling disabled | no enqueue; business path unchanged | telemetry foundation tests |

The browser conditional request case receives 200 after `If-None-Match` and proves
conditional revalidation only. It is deliberately not counted as the 304 result.
The 304 green result comes from the transport and injected HTTP route contracts:
status 304, empty body, validated cache reuse, and invalidation of an old ETag when
the same revision is republished or rolled back with a new `effectiveAt`.

## Safety boundaries

- Kill Switch cannot be bypassed by LKG.
- Unknown components and slot crashes cannot take down the page.
- Strict component props reject Manifest injection of amount, order status, or
  Catalog item facts.
- Telemetry exceptions cannot block navigation actions.
- API contracts, SKU/Catalog facts, order state machine, payment/refund and amount
  rules are unchanged.
- P10 has no Worker, Admin, OA, Dashboard, backend business, or migration diff.

## Test evidence

| Command or suite | Result |
| --- | --- |
| `pnpm exec turbo run build --force` | PASS, 12/12 tasks |
| `pnpm exec turbo run typecheck --force` | PASS, 19/19 tasks |
| `pnpm exec turbo run lint --force` | PASS, 19/19; one pre-existing backend unused-variable warning, zero errors |
| Final Customer dependency-topology build/typecheck/lint | PASS, 18/18 tasks |
| Customer P1–P10 focused unit/contract matrix | PASS, 15 files / 89 tests |
| Real 304 transport + HTTP route contracts | PASS, 2 files / 5 tests |
| Customer control-plane integration + authorization | PASS, 10/10 |
| `pnpm check:migration-integrity` | PASS, locked 57 / candidate 59 |
| `pnpm test:migration:customer-sdui` | PASS, migration 062 partial-DDL and double-replay |
| Customer Playwright final acceptance | PASS, 4/4 |
| Phase23C/Phase24B targeted Customer UI gate governance | PASS, 4/4 |

The final command outputs and counts are recorded from the P10 worktree; no missing
package `dist` was treated as a code failure. Builds were run in dependency order
before route-contract verification.

## Browser and visual QA

- Real app viewport: 390 × 844, DPR 1, Chromium, extensions disabled.
- Four E2E cases: authenticated builtin page/actions, remote reorder/down-list plus
  conditional revalidation, Kill Switch, and offline.
- Evidence:

  - `docs/design/customer-v2/evidence/p10-home-390x844.png`
  - `docs/design/customer-v2/evidence/p10-home-remote-reordered-390x844.png`
  - `docs/design/customer-v2/evidence/design-qa.md`

No pixel-zero-difference claim is made. Formal long Catalog names can be visually
ellipsized while the full `aria-label` and `title` remain available.

## Pollution scan

- No `@sdj99`/`sdj99` runtime naming.
- `apps/customer/src/pages` contains no legacy page module.
- `App` mounts the Hybrid SDUI `HomePage`; it does not contain a fixed homepage JSX
  wall.
- The largest Customer TSX is presentation runtime infrastructure (384 lines);
  `HomePage` is 201 lines and delegates rendering to the composition engine.
- Runtime hex literals exist only in the central Customer token source; the PWA SVG
  literal palette is separately allowlisted.
- No mounted Demo/Mock business data. Text in `workflowBindings` is a prohibition
  against fake outcomes, not seeded runtime data.
- Manifest types/validation are sourced from `@xlb/types` and `@xlb/validators`;
  there is no duplicate wire contract.
- P10 diff contains no Worker/Admin/OA/Dashboard or backend business file.

## Commercial operations facts

The control plane and client chain are present and tested for draft/review/publish,
city authorization, rollout, scheduled effectiveness/expiry, rollback, retirement,
audit, ETag/304, cache, LKG, builtin fallback, circuit breaking, Registry,
Composition Engine, Data Coordinator, Presentation, and Telemetry.

Two deployment facts remain explicit:

1. No Customer SDUI telemetry receiver is configured in the repository. Runtime
   defaults to a Noop sink unless a same-origin
   `VITE_CUSTOMER_TELEMETRY_ENDPOINT` is supplied.
2. The real App currently passes `candidate={null}` to the presentation provider
   because no authoritative runtime-theme/asset-envelope delivery endpoint is
   configured. The theme/Logo runtime, validation, hot swap, failure and recovery
   tests pass; the live browser evidence therefore validates the `xlb100` fallback,
   not a deployed remote theme publication.

No endpoint or backend was fabricated to hide either deployment fact.

## Repository-wide legacy CI disclosure

Before the targeted UI gate correction, `pnpm test:security` reported 12 failures
and 377 passes. Two failures were current Customer UI shape locks and are corrected:
Phase23C demanded the removed `<Suspense>` structure, and Phase24B rejected deletion
of an unrelated legacy Customer UI test.

The remaining ten assertions are unchanged historical non-Customer gates: duplicated
Phase27/28 migration ceilings or old `CURRENT_STATE` wording, plus Phase8K/8L
whole-history diff scans. They are outside the Customer Hybrid SDUI acceptance
scope and were not edited or rerun after the final scope clarification. Therefore:

- Current Customer P1–P10 acceptance: green.
- Repository-wide legacy Phase CI: not claimed green.
- Production/platform-wide commercial readiness: not claimed.

## Operational boundary

No push, deploy, tag, production migration, production data operation, real Provider
operation, or public release was performed.
