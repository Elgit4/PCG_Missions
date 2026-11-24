# Core Staff Workflows Implementation Plan

> **For agentic workers:** Execute tasks in order on `feat/usable-staff-workspace`. Use test-driven development for every behavior change. Do not push to `main` directly.

**Goal:** Complete a reliable contact-detail, notes, interaction-history and follow-up workflow without expanding production permissions or enabling gated modules.

**Architecture:** Extend the existing `staff-operations` Edge Function with scope-checked contact note and interaction routes. Add typed methods to `CmiApiClient`, a focused contact-detail dialog, and better follow-up filters/status actions. Retain the production database schema and all current capability grants.

**Tech Stack:** Deno + Supabase Edge Functions, Postgres/Supabase service client, React 19, TypeScript, Vite, Vitest, Radix Dialog, Lucide.

**Spec:** `docs/superpowers/specs/2026-11-12-core-staff-workflows-design.md`; governing product baseline: `docs/00_MASTER_PRODUCT_SPECIFICATION.md`.

## Global Constraints

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, HMAC keys or provider credentials to the browser.
- All staff operations require verified Supabase Auth identity and current active staff profile.
- Enforce exact capability, active branch and contact assignment scope on every request.
- Do not infer access from role names; fail closed when grants or scope are missing.
- Identity fields stay masked unless `contact.identity.read.scoped` applies.
- Ordinary contact notes must not contain pastoral prayer/care narratives, credentials or secrets.
- Do not deploy pastoral operations or enable public registration, SMS, reports, exports, offline storage or other gated capabilities.
- Use existing production schema and role grants; do not mutate production schema or grants.
- All mutations are server-confirmed; never show success before the backend confirms it.
- Preserve current PCG navy/neutral/crimson visual language and responsive layout.

## Review Focus

- Assignment ends while a detail dialog is open: subsequent reads/writes must be denied and private data cleared.
- Team-scoped user belongs to several teams: only notes for a team assignment shared with the contact may be read/written.
- User has contact access but not note permission: contact can open, notes must stay unavailable.
- Identity permission is absent or revoked: phone/email must be absent from returned DTOs and rendered UI.
- A request times out after reaching the server: UI must not create a duplicate note or interaction on blind retry.
- A task changes in another session: status conflict must lead to a refresh, not overwrite a newer state.

---

### Task 1: Validation contracts and failing tests

**Files:**
- Modify: `supabase-cmi/supabase/functions/staff-operations/validation.ts`
- Modify: `supabase-cmi/supabase/functions/staff-operations/validation_test.ts`

**Interfaces:**
- Produce `parseContactNoteCreate(value)` returning only normalized ordinary note body.
- Produce `parseContactInteractionCreate(value)` returning allowlisted interaction type, optional timezone-aware timestamps, outcome code and summary.
- Reject caller-controlled actor, author, branch, visibility, team, contact, status and unknown fields.

- [ ] Add failing Deno tests for valid note/interaction payloads, unknown fields, invalid types, invalid timestamps, excessive text and spoofed actor/visibility fields.
- [ ] Run the validation test and confirm new cases fail for the missing parsers.
- [ ] Implement the two parsers with strict allowlists and bounded text lengths.
- [ ] Run the complete validation test file and confirm all cases pass.

### Task 2: Scope-enforced Edge Function routes

**Files:**
- Modify: `supabase-cmi/supabase/functions/staff-operations/index.ts`
- Modify: `supabase-cmi/supabase/functions/staff-operations/validation_test.ts` if route helpers are extracted.

**Interfaces:**
- `GET /staff-operations/contacts/{contactId}/notes?branch_id={uuid}`
- `POST /staff-operations/contacts/{contactId}/notes?branch_id={uuid}`
- `GET /staff-operations/contacts/{contactId}/interactions?branch_id={uuid}`
- `POST /staff-operations/contacts/{contactId}/interactions?branch_id={uuid}`

**Behavior:**
- Resolve actor from verified Auth token; resolve current active branch and capability on each request.
- Confirm contact visibility via `contact.read.scoped` and `visibleContactIds`.
- For notes, enforce `contact.note.read.scoped` / `contact.note.create`; server derives note visibility and team ID.
- Author-only notes are author-only; assigned notes require active contact assignment; team notes require active membership plus a matching active contact assignment; branch notes require branch scope.
- For interactions, enforce `contact.interaction.record` for writes and contact read scope for history. Derive actor from Auth.
- Return minimized, allowlisted response fields; use a 16 KB body limit and `Cache-Control: no-store`.
- Extend CORS allowlist methods only as necessary (GET/POST are already supported).

- [ ] Add tests for every parser/security rule before handler implementation.
- [ ] Implement paths and method guards; reject duplicate or unrecognized query parameters.
- [ ] Implement server-derived visibility and team assignment intersection.
- [ ] Add narrow projections and explicit empty/forbidden/not-found behavior.
- [ ] Run `deno fmt --check`, `deno lint`, `deno check` and the full staff-operations test suite in CI.

### Task 3: Typed browser API and tests

**Files:**
- Modify: `web/src/lib/cmi-api.ts`
- Modify: `web/src/lib/cmi-api.test.ts`

**Interfaces:**
- `ContactNote`, `ContactInteraction`, `ContactNoteCreateInput`, `ContactInteractionCreateInput`
- `listContactNotes(branchId, contactId)`
- `createContactNote(branchId, contactId, input)`
- `listContactInteractions(branchId, contactId)`
- `createContactInteraction(branchId, contactId, input)`

- [ ] Add API tests asserting exact path, branch query, bearer token, JSON body and no privileged caller fields.
- [ ] Implement types and methods using the existing request helper.
- [ ] Verify error codes/request IDs remain intact and no service credentials enter browser code.
- [ ] Run frontend unit tests and typecheck.

### Task 4: Contact detail and history experience

**Files:**
- Create: `web/src/components/ContactDetailDialog.tsx`
- Modify: `web/src/components/StaffWorkspace.tsx`
- Modify: `web/production.css`
- Modify: `web/src/components/StaffWorkspace.test.tsx` or focused tests if an existing component-test convention is available.

**Behavior:**
- Open contact details only from an already-visible contact row.
- Use an accessible Radix Dialog with keyboard/focus behavior and responsive internal scrolling.
- Display only fields returned by the permission-filtered contact DTO.
- Gate notes and interaction controls with exact capability checks; backend remains authoritative.
- Provide loading, empty, validation, failure, retry and server-confirmed success states.
- On 401 clear private workspace state; on 403 remove the denied section/control; on assignment/scope failure clear detail data.
- Do not put contact IDs in a newly introduced query parameter or persist notes locally.

- [ ] Add tests for capability gating and note/interaction states before UI changes.
- [ ] Implement the dialog and contact-row open affordance.
- [ ] Verify identity redaction, scope-denied state, focus handling and mobile layout.
- [ ] Run frontend tests, lint, typecheck and build.

### Task 5: Follow-up workflow usability

**Files:**
- Modify: `web/src/components/StaffWorkspace.tsx`
- Modify: `web/production.css`
- Modify: `web/src/lib/cmi-api.test.ts` as needed.

**Behavior:**
- Add server-backed status filters for Open, In progress, Completed and Cancelled.
- Provide explicit Mark in progress / Complete actions using the existing PATCH contract and current update capability.
- Keep task pagination bounded to 50; distinguish the current page's visible counts from branch totals.
- On conflict or uncertain completion, refresh authoritative task state instead of replaying a changed request.
- Provide a useful Overview with visible counts, overdue tasks from loaded records, and direct navigation to Contacts/Follow-up.

- [ ] Add API/utility tests for status-filter parameters and due/overdue calculations.
- [ ] Implement task filter and status actions.
- [ ] Implement honest overview metrics and quick actions.
- [ ] Run frontend tests, lint, typecheck and build.

### Task 6: Product UX contract and handoff

**Files:**
- Create: `web/DESIGN.md`
- Create: `web/UX-CONTRACT.md`
- Modify: `web/INTEGRATION.md`
- Modify: `README.md` only where the user-facing current feature summary is inaccurate.

- [ ] Record existing visual tokens, component patterns, responsive breakpoints and interaction rules.
- [ ] Document sources of truth for contact visibility, note scopes and task lifecycle.
- [ ] Update feature availability statements without describing draft/gated services as operational.
- [ ] Run all frontend and backend CI workflows on the feature branch.
- [ ] Review the whole diff for scope leaks, stale states, unsupported UI, missing empty/error/loading states and inaccessible controls.

## Final verification

- Backend Deno format/lint/check and staff-operations tests pass.
- Frontend Vitest, ESLint, TypeScript and Vite production build pass.
- GitHub Actions CI is green for the exact final commit.
- Vercel preview is READY and changed pages return successfully.
- The PR remains separate from `main` until all checks and review are complete.
- Production Supabase function deployment is a separate step and must be verified before claiming the new notes/interactions endpoints are live.
