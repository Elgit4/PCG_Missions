# Cloudflare API security gates

The API foundation deliberately implements readiness only. Do not add business routes until all gates below are satisfied.

1. Authenticate each request with a verified Better Auth session; never accept actor/profile/role/branch identity from request JSON as authority.
2. Resolve the active staff profile and current account status from D1 on each request (or use a rigorously bounded cache with revocation invalidation).
3. Enforce capability + branch scope + record-level scope in the same trusted domain operation that accesses the data.
4. Keep prayer and pastoral-care narratives behind dedicated highly-restricted capabilities; append access audits for sensitive reads.
5. Use parameterized SQL only. No string interpolation for user-controlled SQL identifiers or values.
6. Use D1 `batch()` for atomic multi-statement mutations and append required audit rows in the same batch.
7. Require same-origin checks and CSRF protection for cookie-authenticated state-changing requests. Use secure, HttpOnly, SameSite cookies.
8. Apply per-IP and per-account rate limits to sign-in, reset, invitation acceptance and bootstrap endpoints. Use the Cloudflare client address header only at the trusted edge.
9. Make invitation and password-reset tokens single-use, hashed at rest, short-lived and bound to one staff account.
10. Keep administrator-issued account setup separate from permanent passwords. Administrators must never create or know staff permanent passwords.
11. Keep provider secrets in Worker secrets, never in Git or Vite/browser variables.
12. Keep SMS dispatch disabled until Hubtel sender approval, credentials, consent/suppression rules and delivery reconciliation are approved.
13. Preserve append-only access/audit records and test tamper attempts.
14. Fail closed if database bindings, auth secrets, mail configuration or environment identity are missing.
