-- CMI production security remediation.
-- Revoke direct Data API execution of the Supabase RLS auto-enable event-trigger
-- helper. The event trigger remains installed and continues to enable RLS on
-- newly-created public tables; this function is not an application RPC.
begin;
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
commit;
