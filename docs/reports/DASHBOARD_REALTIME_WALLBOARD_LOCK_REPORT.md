# XLB Dashboard v1 Lock Report

Date: 2026-07-26

## Plain-language conclusion

The Dashboard construction is complete as a local engineering component. The working code has been committed, its important behavior has been tested against both controlled browser data and the real local database, and a fixed Git tag records the accepted baseline.

“Locked” means future edits must be made as new work and re-verified. It does **not** mean the repository can no longer be edited, and it does **not** mean the Dashboard has been published to the Internet.

## Baseline

- Implementation commit: `e1ec29db` (`feat(dashboard): complete realtime operations wallboard`)
- Canonical annotated tag: `xlb-dashboard-realtime-wallboard-v1`
- Construction location: `G:\xlb100`
- Branch: local `main`

## Locked content

- Independent Dashboard login and Dashboard-bound access token.
- Read-only aggregation from Orders, Payments, Dispatch, Fulfillment, Aftersale and Support.
- Nationwide and city-specific snapshots.
- Transactions, repair fulfillment, complaint/rework, live support, city health and source freshness.
- 15-second refresh, 45-second stale and 120-second disconnected behavior.
- No-name/no-phone/no-address/no-message-content/no-exact-location privacy boundary.
- 1920×1080 option-1 wallboard implementation.
- Shared types, API client validator, tests, Docker build wiring and operating documentation.

## Verification evidence

| Check | Result |
| --- | --- |
| Shared types and API client typecheck | Passed |
| Backend production build | Passed |
| Dashboard build and ESLint | Passed |
| Unit/contract tests | 2 files, 8 tests passed |
| Chromium E2E | 2/2 passed |
| Browser console/page errors | 0 |
| 1920×1080 overflow | None |
| Visual comparison | `apps/dashboard/design-qa.md`: `final result: passed` |
| Docker image/site smoke | `xlb-dashboard:local`; `/dashboard/` returned 200 |
| Real local authentication | OTP request, Dashboard login and Dashboard token passed |
| Real local aggregate API | Nationwide and `hangzhou` reads passed |
| Diff hygiene | Passed |

## Deliberately not included

- No push or remote tag publication.
- No deploy, production data or public URL.
- No real SMS Provider activation.
- No production domain, TLS certificate, registry upload or release announcement.
- No changes to the separate in-progress OA work or the three untracked mobile-app directories.

## Lock rule

The tag `xlb-dashboard-realtime-wallboard-v1` is immutable. Any later Dashboard feature or behavior change starts from this baseline, uses a new commit, reruns the relevant verification, and receives a new versioned tag only when accepted.
