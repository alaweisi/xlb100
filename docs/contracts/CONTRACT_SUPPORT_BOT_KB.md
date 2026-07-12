# Phase 24E Support Bot / Knowledge Base Contract

Phase 24E adds city-scoped knowledge articles with immutable revisions and deterministic/local Bot orchestration over Phase 24D conversations. It does not add an external model, vector database, internet retrieval, or any refund/payment/dispatch/aftersale mutation.

Articles use `draft|published|archived`; revisions use `draft|pending_review|approved|rejected`. Admin/Operator may create and submit. Only Admin may approve/reject/publish, and authors cannot review their own revision. Content changes create a new revision; published history is never overwritten. All writes require idempotency; article pointer changes use `expectedVersion` CAS.

Admin routes are the actual closed set under `/api/internal/support/kb/articles`: create article, create revision, submit/approve/reject revision, and publish approved revision. Bot run is `POST /api/internal/support/bot/conversations/:conversationId/messages/:messageId/run` and is deduplicated by trigger message.

The NLU envelope is restricted to provider `deterministic|mock`, status `matched_local|no_match_local|forced_mock`, and literal `externalProviderExecuted=false`. Bot decisions are `reply|hand_off|no_match`; only an exact published revision may be quoted. Sensitive money, safety, injury, account-compromise and explicit-human requests bypass retrieval and force handoff. Bot never performs protected business actions.

Bot runs store IDs, bounded reason codes and matched immutable version IDs, not a hidden chain of thought. `support.bot.handed_off` contains minimal IDs/reasons and is internal; raw messages and KB content do not enter Outbox or enterprise webhooks.
