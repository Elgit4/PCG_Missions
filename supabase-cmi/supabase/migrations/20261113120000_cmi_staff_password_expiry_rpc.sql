-- Replace unsafe PostgREST column-level password-expiry update with a
-- narrowly scoped server-only RPC. This preserves least privilege: the
-- service role cannot update arbitrary staff_profile columns.
begin;

revoke update (password_setup_expires_at)
  on table public.staff_profile
  from service_role;

create or replace function public.cmi_refresh_staff_password_setup_expiry(
  p_staff_profile_id uuid,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_staff_profile_id is null
     or p_expires_at is null
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '24 hours' then
    return false;
  end if;

  update public.staff_profile
     set password_setup_expires_at = p_expires_at
   where id = p_staff_profile_id
     and account_status = 'active'
     and must_change_password = true
     and password_changed_at is null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.cmi_refresh_staff_password_setup_expiry(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cmi_refresh_staff_password_setup_expiry(uuid, timestamptz)
  to service_role;

comment on function public.cmi_refresh_staff_password_setup_expiry(uuid, timestamptz) is
  'Refreshes only the expiry of an active, uncompleted temporary staff password. Server-only; does not grant direct UPDATE on staff_profile.';

commit;
