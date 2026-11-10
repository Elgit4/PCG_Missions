# CMI backend implementation status

> **Current status — 10 November 2026 (supersedes older dated snapshots below):**
> - PR #24 (staff frontend integration), PR #25 (production frontend/backend integration), and PR #26 (administrator bootstrap and staff password recovery) are **merged into `main`**.
> - The integrated frontend source is present under `web/`; the CMI backend source and Edge Functions are under `supabase-cmi/`. Source presence and merged PRs do not mean either application is deployed.
> - Hosted Supabase project `cgwffpxlwgbnlinzwfoj` currently has **0 public application tables**, **1 recorded migration** (the narrowly scoped `revoke_public_rls_auto_enable_execute` remediation), and **0 deployed CMI Edge Functions**. Security, performance and health advisors returned no lints after the remediation.
> - The six approved role names remain unchanged. The role/capability grants are still intentionally empty. R-01–R-12, D-01–D-13 and authentication/SMS/offline/audit decisions remain pending in the stakeholder register. **Additional auth blocker:** PR #26 currently implements email/password, but the confirmed requirement is email + private PIN with one-time activation; its password flow must not be deployed or treated as accepted until replaced with a secure, supported PIN/session design.
> - A CI regression was identified after the hosted-only RLS helper remediation was added to the permanent migration folder: the isolated local Supabase stack does not create `public.rls_auto_enable()`. The migration has now been guarded with `to_regprocedure()`; verification is pending on the new main-branch CI run.
> - **Production launch remains NO-GO.** Do not apply the identity/domain migrations, seed grants, deploy Edge Functions, bootstrap an administrator, or enable live SMS until the documented approval gates and staging verification are complete.
>
> The dated sections below record implementation history and may describe the state at the time they were written. Use this current status block and the latest production audit for release decisions.

