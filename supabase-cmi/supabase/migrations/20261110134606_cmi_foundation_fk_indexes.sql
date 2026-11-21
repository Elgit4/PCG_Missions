-- Supporting indexes for CMI foundation foreign keys.
-- No data or authorization semantics are changed.
begin;
create index role_capability_capability_id_idx on public.role_capability(capability_id);
create index staff_area_coverage_created_by_idx on public.staff_area_coverage(created_by);
create index staff_area_coverage_service_area_branch_idx on public.staff_area_coverage(service_area_id, branch_id);
create index staff_role_assignment_role_id_idx on public.staff_role_assignment(role_id);
create index staff_role_assignment_assigned_by_idx on public.staff_role_assignment(assigned_by);
create index staff_team_membership_created_by_idx on public.staff_team_membership(created_by);
create index staff_team_membership_team_branch_idx on public.staff_team_membership(team_id, branch_id);
commit;