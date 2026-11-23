-- Restore the hosted-only migration source so the repository's ordered
-- migration set matches the production ledger.
--
-- The hosted catalog confirms that service_role has SELECT on staff_profile
-- and UPDATE only on password_setup_expires_at. The original SQL body is not
-- recoverable from the migration ledger; this is the idempotent statement
-- that reproduces the observed privilege without broadening other columns.

begin;

grant update (password_setup_expires_at)
  on table public.staff_profile
  to service_role;

commit;
