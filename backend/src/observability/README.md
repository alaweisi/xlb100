# backend/src/observability

HTTP metrics expose exactly three labels: `method`, `route`, and `status`.

- `method` is restricted to the standard HTTP method allowlist; other values become `OTHER`.
- `route` comes from Fastify's registered route template. Unmatched/raw URLs become `__unmatched__`, dynamic-looking segments become `:param`, and invalid templates fail closed.
- `status` is one of `1xx` through `5xx`, or `other`.
- Each HTTP metric family has at most 256 label combinations. The final combination is reserved for `__overflow__`.

Never add city, user, worker, order, payment, request, trace, or other identifiers as metric labels. Those values remain available through the existing structured logs and traces.
