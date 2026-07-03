# CONTRACT_WORKER_PROFILE

## Entities

### WorkerProfile

| Field | Type |
|-------|------|
| workerId | string PK |
| displayName | string |
| phoneMasked | string \| null |
| status | active \| suspended \| disabled |

### WorkerCityBinding

| Field | Type |
|-------|------|
| workerId | string |
| cityCode | CityCode |
| isEnabled | boolean |

Composite PK: `(worker_id, city_code)`

### WorkerOnlineStatus

| Field | Type |
|-------|------|
| workerId | string |
| cityCode | CityCode |
| isOnline | boolean |

## Phase 5B rules

- Demo workers in seed `009_worker_demo.seed.sql` are for task pool visibility only
- No certificationStatus field until Phase 6
- No acceptStatus until Phase 7
