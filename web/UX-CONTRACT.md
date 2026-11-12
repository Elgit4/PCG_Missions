# PCG Missions Staff PWA — Interaction and Permission Contract

**Baseline:** CMI Follow-up v2.1  
**Last updated:** 12 November 2026

## Sources of truth

| Concern | Authority |
|---|---|
| Product scope and module behaviour | `docs/00_MASTER_PRODUCT_SPECIFICATION.md` and `docs/01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md` |
| Active staff identity, branch, roles and capabilities | Verified `GET /staff-session` response |
| Record visibility | Trusted `staff-operations` Edge Function and database scope predicates |
| Contact identity fields | Server-projected contact DTO, including identity redaction |
| Note visibility | Server-derived note visibility plus current active branch, team membership and contact assignment |
| Follow-up state | Server response from `staff-operations` task routes |
| Publicly visible content | `public-content` published projections only |

## Navigation and capability rules

- Overview is a summary of data loaded for the current authenticated branch, not an unrestricted church-wide analytics view.
- Contacts is available only when `contact.read.scoped` is granted, or when `contact.capture.create` permits capture-only mode.
- Follow-up is available only when `followup.task.read.scoped` is granted.
- Staff and Access requests require their specific directory/account/recovery capabilities.
- Role names never grant access by themselves.
- The UI may hide unavailable actions, but the backend must repeat every authorization check for every request.
- A missing grant is a deny, not a loading condition or an inferred Admin fallback.

## Contact record workflow

1. The list contains only contacts projected by the authenticated server and active branch.
2. Opening a contact uses its ID from the visible list and retrieves a fresh server projection.
3. Phone/email are rendered only when the server-provided identity permission and redaction status allow them.
4. Notes are fetched only for users with `contact.note.read.scoped`; each note is filtered server-side using the current effective contact and note scopes.
5. A note-create request contains only the note body. The server derives actor, branch, team and visibility. Caller-supplied author, visibility, team or branch metadata is rejected.
6. Contact interactions may be read only for a visible contact; recording requires `contact.interaction.record`. Actor and branch values are server-derived.
7. Ordinary notes/interactions must not contain prayer requests, pastoral care narratives, authentication details or unnecessary identity data.
8. If the record becomes unavailable or an assignment expires, the next server request must deny access and the UI clears or refreshes the stale detail.

## Follow-up task workflow

- Status changes are sent to the backend and the returned server record replaces local state.
- Filters operate on the current loaded page and must say so; never label a 50-row page as a branch-wide count.
- Overdue means an open or in-progress task with a due timestamp earlier than the current time.
- A 409 conflict or uncertain network result triggers an authoritative refresh; the UI must not blindly resubmit a changed operation.
- Completed and cancelled tasks are not presented with active completion controls.

## Async and failure behaviour

- Every data section must define loading, empty, error and successful states.
- Disable a form action while its request is pending.
- Do not announce a mutation as successful until the server confirms it.
- Preserve request IDs in safe operational errors.
- For a network failure after a mutation, tell the user to refresh before retrying when idempotency cannot be guaranteed.
- On 401 clear private workspace data and return to sign-in.
- On 403 keep the session, remove the denied capability/action and provide a concise permission explanation.
- On scope-related 404 clear the record detail rather than leaking whether another user's record exists.
- Do not put contact data, note bodies, credentials or access tokens in URLs, localStorage, analytics or generic logs.

## Release gating

A draft endpoint, database table or adapter type does not make a capability usable. Keep these unavailable until their full workflow and security evidence exist:
- prayer/care operations;
- event publication, public registration, capacity, transport, check-in and closeout;
- announcement publication and delivery;
- sermon/daily-word/tract publication;
- reports and review/approval;
- manual, bulk and automated SMS;
- export;
- offline sync.

A feature is ready only after automated positive and negative authorization tests, API and UI state tests, CI, preview verification and an approved production release.
