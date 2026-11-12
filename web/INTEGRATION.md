# PCG Missions frontend integration and release boundary

**Product baseline:** CMI Follow-up v2.1  
**Last reconciled:** 12 November 2026

This file distinguishes deployed functionality, source-controlled implementation and capabilities still held behind release/security gates. It must not be used to imply that a schema, API contract or draft function is a complete operational feature.

## Current production boundary

The production PWA is hosted at [https://pcg-missions.vercel.app](https://pcg-missions.vercel.app). The React frontend is in `web/` and uses Supabase Auth plus the typed `CmiApiClient`. Staff business data is served through authenticated Supabase Edge Functions; the browser does not query protected Postgres tables directly.

The deployed staff UI currently provides:
- Overview and branch selection;
- scoped Contacts listing, search, pagination and online capture;
- scoped Follow-up task listing, pagination and status updates;
- staff directory/account operations where capability is granted;
- password-reset request review where capability is granted;
- first-login mandatory password replacement.

The staff workspace only mounts after a Supabase Auth session and a server-issued `GET /staff-session` response confirm an active staff profile and branch. A pending temporary-password change blocks normal workspace access.

The initial Admin/Pastor identity and role assignment have been provisioned in the hosted Supabase project. Authentication responses were accepted by Supabase during the latest troubleshooting, but the full browser transition from sign-in to the staff workspace has not yet been confirmed. A Vercel READY deployment or a successful Auth token response alone is not end-to-end login verification.

## Core staff workflow enhancement in this feature branch

This branch adds the next practical workflow around the existing contact/follow-up foundation:
- a contact-detail dialog that refreshes the server-authorised contact projection;
- permission-gated ordinary contact notes;
- chronological call/visit/message/meeting interaction history;
- server-derived note author, branch, team and visibility;
- contact-note scope intersected with the actor's current contact-read scope;
- interaction writes intersected with current visible-contact scope;
- follow-up status filters and explicit Start/Complete actions;
- overview counts clearly labelled as loaded records rather than branch totals;
- improved mobile capture fields and responsive detail layout.

The browser API methods and Edge Function routes are source-controlled on this feature branch. **They are not live in production until the updated `staff-operations` Edge Function is deployed and its authenticated endpoints are verified.** Vercel frontend preview success is not proof that the corresponding Supabase function has been deployed.

## Authentication boundary

Authentication uses Supabase Auth email/password. The frontend does not implement a custom PIN verifier, browser-side token issuer, PIN-as-password shortcut or administrator-known permanent password.

Initial access and administrator-approved recovery use random, short-lived temporary credentials delivered to the verified email address. The first authenticated step is permanent-password replacement. The administrator never sees, chooses or stores a staff member's permanent password. Do not recreate the existing administrator or expose credentials in support messages.

## API adapter and authorization

`src/lib/cmi-api.ts` is the typed browser adapter for CMI Edge Function contracts. It:
- sends the publishable key and the current Supabase Auth bearer token;
- calls `/functions/v1/{function-name}`, or the same-origin auth/session proxy where configured;
- preserves safe backend error codes and request correlation IDs;
- never connects directly to Postgres;
- uses no browser service-role key or provider secrets;
- bounds list requests to server-supported limits.

`src/lib/capabilities.ts` controls only what the UI offers. It requires an explicit branch ID included in the server-issued session and exact capability grants. Role names do not grant access. Edge Functions must independently authenticate each request, resolve current staff/branch assignments and enforce record scope.

## Data protection and scope

- Public/authenticated browser roles do not have direct access to protected business tables.
- Identity fields are returned only through server projections authorised for the identity capability; the UI must preserve redaction.
- Contact, note and interaction operations must be restricted to the active branch and current contact visibility.
- Note author, visibility, branch and team scope are server-derived. Note visibility must not exceed the intersection of the current contact scope and note-specific capability scope.
- Ordinary notes and task notes are not places for prayer requests, pastoral care narratives, credentials or secrets.
- Contact interaction actor identity is derived from the verified Auth user.
- Contact and pastoral data must not be written to local storage, analytics or URLs.

## Capabilities deliberately unavailable

Do not present these as operational until their contracts, authorization, testing and production release gates are complete:
- prayer/care lists, creation, assignment or mutation; the restricted pastoral function remains held for independent security review;
- duplicate contact merge/reversal and the complete note/assignment/outcome lifecycle where not yet surfaced;
- public event publication, registration, capacity, transport reservation, check-in and closeout;
- announcement publication, scheduled delivery and channel dispatch;
- published Daily Word, tract authoring and full public-content administration;
- ministry reports, review/approval and exports;
- manual/bulk/automated SMS dispatch, consent/suppression, campaigns and delivery receipts;
- offline capture and synchronization.

Private draft APIs for events, announcements, sermons/welcome messages and branch calendar entries do not implement the full visitor-facing or ministry workflow. A provider adapter is not an SMS dispatcher. Database tables are not user-facing screens.

## Verification and release gates

The feature branch must pass:
1. frontend TypeScript typecheck, ESLint, Vitest and Vite production build;
2. backend Deno format, lint, type-check and staff-operations tests;
3. the repository's isolated Supabase migration/pgTAP workflow;
4. preview deployment checks and responsive UI review;
5. authenticated positive/negative scope tests for note and interaction endpoints.

Before production rollout, deploy the updated `staff-operations` Edge Function separately from the Vercel frontend, then verify the exact endpoints with approved test accounts and the current hosted schema. Do not change production schema or grants for this workflow. Maintain staging/UAT, restore rehearsal, monitoring and data-protection gates for the broader release.

See [DESIGN.md](DESIGN.md), [UX-CONTRACT.md](UX-CONTRACT.md), [Master Product Specification](../docs/00_MASTER_PRODUCT_SPECIFICATION.md), [Owner-Directed Safe Defaults](../docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md) and [Backend Implementation Status](../supabase-cmi/IMPLEMENTATION_STATUS.md).
