# Phase 20 LBS-lite Dispatch Contract

Worker location identity is derived from the worker bearer token and scoped city. Exact coordinates are private to the worker-owned location endpoint. Admin dispatch views receive distance, ETA, freshness, and provider truthfulness only.

Locations are accepted only when captured within ten minutes, no more than two minutes in the future, accuracy is at most 5 km, and service radius is 1-50 km. Matching requires an enabled city binding, online/available status, certification, SKU qualification, location sharing, an unexpired location, and distance within radius.

`LocalMockGeoProvider` performs deterministic local geocoding and Haversine distance/ETA. Its envelope is always `local_mock / calculated_mock / externalProviderExecuted=false`; Phase 20 has no Amap key, SDK, HTTP endpoint, or paid map call.

Offers persist distance, ETA, score, expiry, and provider envelope. Database composite foreign keys bind locations to worker/city and offers/events to task/city. Task acceptance remains a CAS transition with one acceptance per task; deadlock/duplicate races resolve to idempotent success for the winner or `409` for another worker. Timeout races use the same terminal-offer CAS.
