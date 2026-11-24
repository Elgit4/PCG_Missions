# PCG Missions — Core Staff Workflow Design

**Date:** 12 November 2026  
**Product baseline:** CMI Follow-up v2.1  
**Status:** Implementation brief derived from the existing product specification and production schema

## Intent

Make the deployed staff workspace useful for day-to-day ministry follow-up. A staff member must be able to open a permitted contact, understand what has happened, record an ordinary follow-up note or call/visit outcome, and manage the next follow-up action. The experience must remain usable on phones and desktop without widening anyone's data access.

## Users and job

The primary users are Admin/Pastor, Coordinators, Team Leaders, Field Workers and Follow-up Volunteers. Their shared job is to maintain continuity of contact and follow-up while seeing only records, identity fields and notes that their active capabilities and assignments permit.

## Current state found

The current staff workspace exposes Overview, Contacts, Follow-up tasks, Staff accounts and Password-reset requests. Contacts can be listed, searched and captured; follow-up tasks can be listed, created and completed. The current API client has contact detail and update methods, but the screen does not open a contact detail view. Production already contains contact notes and interaction tables and role-capability grants for scoped note read/create and interaction recording; the staff-operations HTTP contract does not yet expose those operations. Task update APIs already support status and ordinary task fields.

## Approaches considered

1. **Expose every documented module immediately.** Rejected: event, calendar, content and announcement backends include draft-only contracts, and no corresponding production capability grants exist for the current Admin/Pastor session. Pastoral operations are not deployed; registration, SMS, reports, exports and offline workflows remain gated. Showing them as available would mislead staff or bypass approval.
2. **Complete the contact and follow-up workflow on the existing architecture.** Selected: add scoped contact notes and interaction APIs to the existing trusted staff-operations function, create a contact detail experience using those endpoints, and improve task filtering/status handling. This yields immediate operational value while preserving the current schema, capability catalogue and branch/assignment model.
3. **Replace the entire app shell and backend.** Rejected: high regression risk, unnecessary duplication and no benefit over extending the current React/Supabase architecture.

## Goals

- Make every visible contact row open a detail view for users with permitted access.
- Show contact profile fields only when the relevant identity capability is present.
- Show ordinary notes only when the server confirms note visibility and current record scope.
- Allow staff to add ordinary notes; visibility is derived by trusted server-side logic, never accepted from the browser.
- Show a chronological interaction history and allow permitted staff to record a call, visit, message, meeting or other interaction with outcome and optional next action.
- Improve follow-up task filters and lifecycle actions using the existing task API.
- Make overview metrics honest about the currently loaded/scope-visible records.
- Provide keyboard-accessible dialogs, mobile layouts, loading/empty/error/success states and safe retry behavior.
- Add automated validation and API tests for the new behavior.

## Non-goals

This change does not enable pastoral prayer/care lists or mutations, public event registration, transport reservations, attendance check-in, public publishing, live SMS, reports, exports or offline storage. It does not add role grants, weaken authorization, create new staff accounts, alter the initial administrator, or introduce a new database schema.

## Security and data rules

- All business data remains behind authenticated Supabase Edge Functions; the browser never queries protected tables directly.
- Every request derives the actor from the validated bearer token and recalculates current role grants, branch scope and record assignments.
- Note visibility is assigned by the server from the actor's allowed scope. Browser payloads cannot choose author, visibility, team, branch or actor.
- Author-only notes stay author-only. Assigned notes require current record visibility. Team notes require a current team membership and matching active contact assignment. Branch notes require branch scope.
- Interaction reads/writes are limited to a currently visible contact and the exact relevant capability. Actor ID and branch come from trusted request context.
- Phone/email remain masked unless identity-read permission is present. Ordinary notes must not be used for prayer/care narratives, credentials or sensitive pastoral information.
- Do not store sensitive contact data in local storage, analytics, logs or URL parameters.

## Implementation choices

- Preserve React 19, Vite, TypeScript, Vitest, Supabase Edge Functions and the current visual language.
- Keep the existing navy/neutral/crimson direction; do not add purple or a generic redesign.
- Add typed API methods and focused UI components instead of rewriting the 650-line workspace.
- Reuse existing contact/task tables, capability grants and database contracts. No migration or production grant change is planned.
- Use pessimistic server-confirmed mutations, idempotency where the existing API supports it, and refresh authoritative state after uncertain completion.

## Acceptance criteria

1. A staff user can open only a contact already returned within their authorized scope; a forged contact ID returns a non-disclosing not-found/forbidden response.
2. Note list responses contain only notes visible to the actor's current scope; changing or ending an assignment removes access on the next request.
3. A note-create client cannot set author, branch, team or visibility; the server derives these and rejects unsupported fields.
4. A staff user without note-create permission cannot add a note even if the UI is manipulated.
5. A staff user without interaction-record permission cannot record an interaction; actor identity cannot be spoofed.
6. A staff user without identity-read permission sees no phone/email in detail, notes, interaction history or client state.
7. Follow-up status transitions and filters are server-backed and refresh correctly after success or conflict.
8. No gated module is represented as operational.
9. Backend validation tests, frontend API tests, frontend typecheck/lint/build and repository CI pass.
10. The changed contact and follow-up flows are manually checked at desktop and narrow mobile widths before production release.

## Risks and release boundary

The production Edge Function must be updated separately from Vercel frontend deployment. A green frontend preview alone does not prove the backend endpoints exist in production. The new Edge Function must pass its Deno checks and authorization tests before deployment. The PR must not be merged or deployed to production while checks are failing.