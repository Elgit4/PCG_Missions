-- Defense in depth: the bootstrap lease is reachable only through the
-- SECURITY DEFINER RPCs. Keep direct table access denied to every API role.
alter table private.first_admin_bootstrap_lease
  enable row level security;
