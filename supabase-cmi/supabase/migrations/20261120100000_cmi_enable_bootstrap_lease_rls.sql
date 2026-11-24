-- Defense in depth: the bootstrap lease is reachable only through the
-- SECURITY DEFINER RPCs. Keep direct table access denied to every API role.
alter table private.first_admin_bootstrap_lease
  enable row level security;

-- Least-privilege service-role grants for Edge Function direct-read/write paths.
-- Browser roles remain denied; authorization continues to be enforced in the
-- Edge Functions before these server-side queries are executed.
grant select, insert on table
  public.contact_note,
  public.contact_interaction
to service_role;

grant select on table
  public.staff_team_membership,
  public.event_team_assignment
to service_role;
