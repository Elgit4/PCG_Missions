-- Serialize first-administrator bootstrap and recovery across Edge Function instances.
-- A short lease prevents concurrent calls from rotating different temporary
-- passwords and delivering credentials that are already invalidated.

create table private.first_admin_bootstrap_lease (
  lock_name text primary key check (lock_name = 'first_admin'),
  lease_id uuid not null,
  lease_expires_at timestamptz not null,
  acquired_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.first_admin_bootstrap_lease
  from public, anon, authenticated, service_role;

create or replace function public.cmi_acquire_first_admin_bootstrap_lease(
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_lease_id is null then
    raise exception using errcode = '22023', message = 'lease id required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pcg_missions_first_admin_bootstrap_lease', 0)
  );

  insert into private.first_admin_bootstrap_lease(
    lock_name, lease_id, lease_expires_at
  )
  values (
    'first_admin', p_lease_id, pg_catalog.now() + interval '3 minutes'
  )
  on conflict (lock_name) do update
  set lease_id = excluded.lease_id,
      lease_expires_at = excluded.lease_expires_at,
      acquired_at = pg_catalog.now()
  where private.first_admin_bootstrap_lease.lease_expires_at <= pg_catalog.now();

  return exists (
    select 1
    from private.first_admin_bootstrap_lease
    where lock_name = 'first_admin'
      and lease_id = p_lease_id
      and lease_expires_at > pg_catalog.now()
  );
end;
$$;

create or replace function public.cmi_release_first_admin_bootstrap_lease(
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deleted integer;
begin
  if p_lease_id is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pcg_missions_first_admin_bootstrap_lease', 0)
  );

  delete from private.first_admin_bootstrap_lease
  where lock_name = 'first_admin'
    and lease_id = p_lease_id;

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.cmi_acquire_first_admin_bootstrap_lease(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cmi_release_first_admin_bootstrap_lease(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.cmi_acquire_first_admin_bootstrap_lease(uuid)
  to service_role;
grant execute on function public.cmi_release_first_admin_bootstrap_lease(uuid)
  to service_role;
