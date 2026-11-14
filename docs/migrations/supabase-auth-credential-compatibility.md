# Supabase credential compatibility migration

## Source audit

Read-only audit of the PCG Missions Supabase project on 14 November 2026 found:

- 2 `auth.users` records and 2 email identities.
- 2 linked `staff_profile` records, both active.
- Both password credentials are 60-character bcrypt hashes with the `$2a$` prefix (GoTrue bcrypt format).
- Both source email addresses are confirmed.
- Existing role assignments are `admin_pastor` and `team_leader`.

No password plaintext was read or exported during the audit.

## Compatibility implementation

Better Auth 1.7.22 defaults to scrypt, which cannot verify Supabase GoTrue bcrypt hashes. The Worker now supplies custom Better Auth password functions backed by bcryptjs:

- Verification accepts GoTrue `$2a$` bcrypt hashes and compatible `$2b$`/`$2y$` hashes.
- New passwords are hashed with bcrypt cost 12.
- Password verification is performed by Better Auth's normal email/password sign-in path.
- The integration fixture now seeds a cost-10 bcrypt hash, matching the source GoTrue format, and signs in through the Worker.

This keeps existing passwords usable without requiring a forced reset. A password reset remains the fallback for credentials that fail verification or are not bcrypt.

## Identity mapping for the non-production import

When the approved account import is run:

- Preserve the Supabase auth user UUID as Better Auth `user.id`.
- Store `auth.users.encrypted_password` in Better Auth `account.password` with `providerId='credential'`.
- Preserve the email-confirmed state and user creation timestamp.
- Preserve staff profile IDs, full names, account status and `must_change_password` state.
- Map source role codes to the matching seeded Cloudflare role codes.
- Map the source PCG Main Branch to the sole seeded non-production Victory Congregation branch. This mapping is non-production-only and must be reconfirmed against the approved production branch mapping before cutover.

## Safety

- The source Supabase project is read-only during this work.
- No source password hashes, user records, or sessions are deleted or modified.
- Existing Supabase sessions are not portable and users will sign in again.
- Do not run a production import until the owner approves the cutover and the branch mapping is confirmed.
- After import, verify sign-in with existing passwords on non-production before approving production cutover.