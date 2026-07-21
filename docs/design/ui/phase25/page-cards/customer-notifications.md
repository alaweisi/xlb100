# Customer — Notifications

| Field | Contract |
| --- | --- |
| route / role | `/customer/notifications` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; notification API contract controls states and actions |
| workflow / API source | notification inbox list, mark-read, archive/restore and cursor pagination through `@xlb/api-client` |
| states | loading, inbox empty, archive empty, error/retry, ready, loading-more, row busy, conflict/stale target |
| actions | switch inbox/archive, mark read, archive, restore, load more, follow valid target deep link |
| constraints | authenticated customer and current city only; revision/conflict remains server-owned; notification target never grants additional permission |
| components | Customer shell, glass page header, segmented control, notification cards, state components, row actions, pagination control |
| viewport / evidence | 390×844; `evidence/customer/customer-notifications-<state>-390x844-<iteration>.png` |
| design QA | Enter from the Home notification bell; inherit Customer service-card hierarchy, protected status semantics, safe area and 44px targets |
