# CMI backend implementation status

**Baseline:** CMI Follow-up v2.1  
**Workspace:** `supabase-cmi/` (isolated from historical `supabase/`)  
**Status:** Foundation migration drafted and committed; local execution pending.

## Implemented in this slice

- Dedicated Supabase CLI configuration with a distinct local project ID and ports.
- Church and branch foundation with branch-aware candidate keys.
- Supabase Auth-linked staff profile; no PIN/password storage.
- Exactly six CMI role catalogue entries.
- Capability catalogue and explicit role-capability join structure; no grants seeded.
- Time-bounded staff role assignments supporting multiple roles.
- Teams, memberships, service areas and staff area coverage.
- RLS enabled and browser grants withheld on all foundation tables.
- Initial pgTAP structural and deny-by-default test file.
- Contacts/follow-up domain SQL draft covering nine tables, integrity constraints, indexes, idempotent capture metadata, and conservative assignment rules.
- Matching pgTAP draft covering table presence, RLS, closed Data API grants, shared-phone handling, branch consistency, capture idempotency and assignment constraints.

## Deliberately not implemented yet

- Staff email + PIN credential activation/exchange/reset endpoints. The credential lifecycle and Supabase Auth integration require approval.
- Role capability grants and role/record scope policies. R-01–R-12 and D-01 remain pending.
- Promoted/executable contacts, capture, assignment, notes, merge and follow-up migrations (current SQL remains a draft under `schema-drafts/` until CLI migration generation and local validation are available).
- Prayer/care tables and audited narrative-read path.
- Event registration, transport capacity, check-in and public endpoints.
- Public content publication.
- SMS provider adapter, send pipeline, callbacks or automation.
- Offline queue and device enrollment.
- Production deployment or hosted database linking.

## Blocking design reconciliation

See [schema reconciliation crosswalk](../docs/16_CMI_SCHEMA_RECONCILIATION_AND_DECISION_CROSSWALK.md). Do not add further domain migrations until the listed schema contradictions are resolved and the relevant stakeholder choices are recorded.

## Verification

The foundation migration and pgTAP test are committed but have not been executed. The contacts/follow-up SQL and test remain drafts, not CLI migrations. The GitHub-only implementation environment did not provide a local PostgreSQL/Supabase runtime in this work session. No hosted Supabase project was accessed, linked, migrated or modified.
