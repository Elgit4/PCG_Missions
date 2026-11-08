# CMI Follow-up — Backend Implementation Baseline

**Baseline:** CMI Follow-up v2.1  
**Branch:** `backend/cmi-foundation`  
**Status:** Backend foundation started; business schema and authentication remain gated by stakeholder decisions  
**Repository source of truth:** `README.md`, `docs/00_MASTER_PRODUCT_SPECIFICATION.md`, `docs/02_ROLES_PERMISSIONS_AND_SECURITY.md`, `docs/03_DATA_AND_DATABASE_ARCHITECTURE.md`, `docs/05_IMPLEMENTATION_AND_DEPLOYMENT_PLAN.md`, `docs/07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md`, `docs/08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md`, `docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md`, `docs/12_RLS_POLICY_AND_SECURITY_TEST_PLAN.md`, and `docs/13`–`15` data dictionaries.

## 1. Repository inspection findings

The repository contains the CMI v2.1 product/security baseline and proposed data model. It does not yet contain an approved CMI migration set, CMI database implementation, deployed CMI project reference, application API contract, or verified CMI RLS test suite.

The previous active Supabase paths contained three ChurchConnect-era migrations and a two-role ChurchConnect pgTAP suite. These do not implement the six-role CMI requirements. They have been preserved under `docs/legacy/churchconnect/` and removed from the active Supabase migration/test discovery paths. The old ChurchConnect workflow has also been archived; it must not be represented as a CMI quality gate.

The local Supabase CLI identifier is now `cmi-follow-up-local`. This is only a local configuration identifier and does not identify or connect to a hosted project.

## 2. Initial backend foundation committed

| Artifact | Purpose | Status |
|---|---|---|
| `supabase/functions/_shared/http.ts` | Shared JSON response/error envelope, request ID, no-store response policy, method handling and exact-origin CORS allowlist | Added |
| `supabase/functions/health-check/index.ts` | Minimal liveness endpoint; reveals no project IDs, secrets, database metadata or personal data | Added |
| `supabase/functions/_shared/http_test.ts` | Unit tests for CORS, response headers, error envelope and method handling | Added; not yet run locally |
| `supabase/functions/.env.example` | Safe example for exact allowed browser origins | Added |
| `supabase/functions/README.md` | Function layout, security conventions and local development guardrails | Added |
| `.github/workflows/cmi-edge-functions.yml` | Deno format, lint, type-check and unit-test checks | Added; pending CI execution |
| `docs/legacy/churchconnect/` | Preserves superseded SQL, tests and workflow outside active Supabase discovery paths | Added |
| `supabase/config.toml` | Local project identifier renamed to CMI | Updated |

## 3. Security and platform decisions applied to the foundation

- Supabase Edge Functions are the initial server-side execution environment, consistent with the Supabase architecture described in the repository.
- JWT verification is not disabled. The function uses the platform's default JWT verification.
- CORS is not treated as authentication. Only exact origins listed in `APP_ALLOWED_ORIGINS` are allowed; wildcard origins are not used.
- Responses are non-cacheable by default and carry a correlation ID.
- Error responses do not return stack traces or raw implementation details.
- No service-role key, provider credential, PIN, or other secret is stored in source control.
- No client-facing business endpoint has been added before the corresponding data model and authorization contract exist.

## 4. Required Supabase platform consideration

The Supabase changelog records a breaking change effective 30 October 2026: new tables are no longer automatically exposed through the Data API. When the CMI schema is implemented, the team must explicitly decide which tables or views are exposed and grant only the required privileges. This is separate from RLS: grants control whether a role can reach an object; RLS controls which rows it can access.

The preferred default is to keep internal/sensitive data behind narrow, reviewed database/API boundaries and explicitly expose only approved public projections and staff data access paths. Every exposed table must have RLS enabled and tested.

Reference: https://supabase.com/changelog?types=breaking-change

## 5. Backend build sequence

### Backend 0 — Repository safety and runtime foundation
- [x] Separate active CMI backend paths from legacy ChurchConnect SQL and tests.
- [x] Establish the Edge Function shared HTTP boundary.
- [x] Add a minimal liveness endpoint.
- [x] Add Deno CI checks and unit tests.
- [ ] Run CI and fix all reported issues.
- [ ] Install/verify the Supabase CLI and Deno in a local development environment.

### Backend 1 — Schema reconciliation and migration readiness
- [ ] Reconcile DD-01–DD-25 across the logical ERD, physical proposal and dictionaries.
- [ ] Resolve or formally approve R-01–R-12 and D-01–D-13.
- [ ] Confirm the branch model, auth identity retention, role-assignment lifecycle, contact field visibility, public registration rules and retention schedule.
- [ ] Produce a CMI migration sequence and executable pgTAP suite.
- [ ] Run the full migration set and security suite against a disposable local Supabase stack.

**No migration is currently approved or created.** The Supabase CLI is not installed in the execution environment used for this initial repository work. Supabase's CLI guidance requires creating migrations with `supabase migration new <descriptive_name>`; a migration must be created through that command in a configured local checkout, not by guessing a timestamped filename through the GitHub file API.

### Backend 2 — Identity and staff access
- [ ] Implement approved email + PIN activation, private PIN establishment, sign-in, reset/reissue and deactivation.
- [ ] Implement server-controlled role assignments and capability evaluation.
- [ ] Add session revocation and audit behaviour.
- [ ] Prove stale JWTs and deactivated staff cannot access protected operations.

The activation PIN lifecycle, PIN entropy/length, recovery verification, rate limits and Auth integration remain pending in the stakeholder decision register. No PIN verifier or credential endpoint should be implemented until this is approved and security-reviewed.

### Backend 3 — Organizational scope and core operations
- [ ] Church/branch bootstrap and staff/team membership.
- [ ] Contacts, field capture, duplicate review/merge and assignment.
- [ ] Follow-up lists, tasks, interactions and task history.
- [ ] Field-level contact projections and scoped reports.

### Backend 4 — Restricted pastoral workflows
- [ ] Prayer requests and assignment history.
- [ ] Care records, assignments and outcomes.
- [ ] Audited oversight path for privileged narrative access.
- [ ] Negative tests for multi-role users and unassigned records.

Prayer/care narratives must never be exposed through generic list/search endpoints or broad dashboard projections. Role union cannot bypass assignment or explicit oversight.

### Backend 5 — Events and public visitor operations
- [ ] Events, registration, capacity and transport reservation.
- [ ] Narrow anonymous registration endpoint with rate limits and idempotency.
- [ ] Check-in, event assignments and closeout.
- [ ] Published-content projections for the public site.

### Backend 6 — SMS and limited offline
- [ ] Consent/lawful-basis and suppression model.
- [ ] Manual, bulk and automated SMS authorization.
- [ ] Separate campaign creator/approver, send-time revalidation, caps and quiet hours.
- [ ] Provider adapter, signed callback verification, replay protection and idempotent delivery events.
- [ ] Limited offline capture/check-in receipts only; no pastoral narratives in local queues.

No provider, sender ID, Ghana regulatory/sender requirements, pricing, consent wording, automation trigger catalogue or spend limits are approved. Live SMS must remain disabled.

## 6. Explicit non-actions

This foundation commit does not:
- apply or deploy migrations;
- connect to any hosted Supabase project;
- reuse SkillSprint or another project's Supabase instance;
- enable Data API access to any table;
- create production roles or grants;
- deploy Edge Functions;
- create real staff accounts or PINs;
- configure an SMS provider or send messages;
- load real visitor, prayer or care data.

## 7. Verification status

| Check | Result |
|---|---|
| Repository and CMI requirements inspected | Completed |
| Legacy migration/test artifacts moved out of active Supabase paths | Completed and preserved |
| Edge Function source committed | Completed |
| Deno CI workflow committed | Completed; passed on GitHub Actions run [42431556654](https://github.com/Elgit4/PCG_Missions/actions/runs/42431556654) |
| GitHub Actions Deno format/lint/type-check/unit tests | Passed on run [42431556654](https://github.com/Elgit4/PCG_Missions/actions/runs/42431556654) |
| Supabase CLI migration generation | Not run — CLI unavailable in this environment |
| PostgreSQL migration/RLS tests | Not run — no approved CMI migrations or local Supabase stack |
| Hosted Supabase changes | None |

## 8. Approval gate before business-schema implementation

The next database implementation step requires an approved CMI schema and stakeholder decisions. In particular, confirm the safe defaults in `docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md`, or provide alternatives with approver/date. A request to start backend work does not itself resolve church policy decisions recorded as pending in that register.
