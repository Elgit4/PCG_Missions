begin;

select plan(12);

select has_table(
  'private',
  'first_admin_bootstrap_lease',
  'first-admin lease table exists in the private schema'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cmi_acquire_first_admin_bootstrap_lease(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot acquire the bootstrap lease'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.cmi_acquire_first_admin_bootstrap_lease(uuid)',
    'EXECUTE'
  ),
  'authenticated browser users cannot acquire the bootstrap lease'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.cmi_acquire_first_admin_bootstrap_lease(uuid)',
    'EXECUTE'
  ),
  'only the trusted service role can acquire the bootstrap lease'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.cmi_release_first_admin_bootstrap_lease(uuid)',
    'EXECUTE'
  ),
  'trusted service role can release the bootstrap lease'
);

select ok(
  public.cmi_acquire_first_admin_bootstrap_lease(
    '11111111-1111-4111-8111-111111111111'
  ),
  'first invocation acquires the lease'
);

select ok(
  not public.cmi_acquire_first_admin_bootstrap_lease(
    '22222222-2222-4222-8222-222222222222'
  ),
  'concurrent invocation cannot replace a live lease'
);

select ok(
  not public.cmi_release_first_admin_bootstrap_lease(
    '22222222-2222-4222-8222-222222222222'
  ),
  'a different invocation cannot release the active lease'
);

select ok(
  public.cmi_release_first_admin_bootstrap_lease(
    '11111111-1111-4111-8111-111111111111'
  ),
  'lease owner can release the lease'
);

select ok(
  public.cmi_acquire_first_admin_bootstrap_lease(
    '22222222-2222-4222-8222-222222222222'
  ),
  'a new invocation can acquire after release'
);

update private.first_admin_bootstrap_lease
set lease_expires_at = pg_catalog.now() - interval '1 second'
where lock_name = 'first_admin'
  and lease_id = '22222222-2222-4222-8222-222222222222';

select ok(
  public.cmi_acquire_first_admin_bootstrap_lease(
    '33333333-3333-4333-8333-333333333333'
  ),
  'expired lease can be safely taken over'
);

select ok(
  public.cmi_release_first_admin_bootstrap_lease(
    '33333333-3333-4333-8333-333333333333'
  ),
  'final lease owner can release the lease'
);

select * from finish();
rollback;
