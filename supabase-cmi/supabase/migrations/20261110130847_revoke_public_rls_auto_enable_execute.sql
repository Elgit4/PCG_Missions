-- CMI production security remediation.
-- Revoke direct Data API execution of the Supabase RLS auto-enable event-trigger
-- helper. The event trigger remains installed and continues to enable RLS on
-- newly-created public tables; this function is not an application RPC.
--
-- Hosted Supabase projects may contain this platform-managed helper while the
-- isolated local Supabase stack may not. Guard the revocation so the same
-- migration safely replays in both environments without weakening either.
begin;

do $cmi$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$cmi$;

commit;
