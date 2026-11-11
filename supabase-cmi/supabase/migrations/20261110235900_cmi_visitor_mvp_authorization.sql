-- PCG Missions visitor-management MVP authorization baseline.
-- Least-privilege defaults for ordinary visitor records and follow-up.
-- Edge Functions remain the only business API; browser table access stays closed.
begin;
insert into public.capability (code, description, sensitivity) values
('staff.directory.read','Read the minimum branch staff directory projection.','ordinary'),
('staff.account.manage','Manage existing staff account status and approved recovery.','restricted'),
('access.role.assign','Assign or revoke one of the six predefined staff roles.','highly_restricted'),
('staff.password_reset.manage','Review and initiate staff credential recovery.','restricted'),
('contact.capture.create','Create a visitor record through the staff capture workflow.','ordinary'),
('contact.read.scoped','Read ordinary visitor fields within the assigned scope.','ordinary'),
('contact.update.scoped','Update ordinary visitor fields within the assigned scope.','ordinary'),
('contact.identity.capture','Capture visitor phone and email where required for follow-up.','restricted'),
('contact.identity.read.scoped','Read visitor phone and email within the assigned scope.','restricted'),
('contact.identity.update.scoped','Update visitor phone and email within the assigned scope.','restricted'),
('contact.note.create','Add ordinary non-sensitive visitor follow-up notes.','ordinary'),
('contact.note.read.scoped','Read ordinary visitor follow-up notes within scope.','ordinary'),
('contact.interaction.record','Record visitor calls, visits and follow-up outcomes.','ordinary'),
('contact.assign.scoped','Assign visitors within the role scope.','ordinary'),
('followup.task.create','Create follow-up tasks for in-scope visitors.','ordinary'),
('followup.task.read.scoped','Read follow-up tasks within the role scope.','ordinary'),
('followup.task.update.scoped','Update permitted follow-up task fields and status.','ordinary'),
('followup.task.assign.scoped','Assign follow-up tasks within the role scope.','ordinary')
on conflict (code) do update set description=excluded.description,sensitivity=excluded.sensitivity,is_active=true;

-- Admin/Pastor: branch-wide visitor/follow-up plus limited staff control plane.
insert into public.role_capability(role_id,capability_id,scope_mode)
select r.id,c.id,'branch' from public.role r cross join public.capability c
where r.code='admin_pastor' and c.code in (
'staff.directory.read','staff.account.manage','access.role.assign','staff.password_reset.manage',
'contact.capture.create','contact.read.scoped','contact.update.scoped','contact.note.create',
'contact.note.read.scoped','contact.interaction.record','contact.assign.scoped',
'followup.task.create','followup.task.read.scoped','followup.task.update.scoped','followup.task.assign.scoped')
on conflict do nothing;

-- Coordinator: branch-wide ordinary contact/follow-up only; identity fields are redacted by default.
insert into public.role_capability(role_id,capability_id,scope_mode)
select r.id,c.id,'branch' from public.role r cross join public.capability c
where r.code='coordinator' and c.code in (
'contact.capture.create','contact.read.scoped','contact.update.scoped','contact.note.create',
'contact.note.read.scoped','contact.interaction.record','contact.assign.scoped',
'followup.task.create','followup.task.read.scoped','followup.task.update.scoped','followup.task.assign.scoped')
on conflict do nothing;

-- Team Leader: team-scoped ordinary visitor/follow-up; identity fields are redacted by default.
insert into public.role_capability(role_id,capability_id,scope_mode)
select r.id,c.id,'team' from public.role r cross join public.capability c
where r.code='team_leader' and c.code in (
'contact.capture.create','contact.read.scoped','contact.update.scoped','contact.identity.capture',
'contact.identity.read.scoped','contact.identity.update.scoped','contact.note.create',
'contact.note.read.scoped','contact.interaction.record','contact.assign.scoped',
'followup.task.create','followup.task.read.scoped','followup.task.update.scoped','followup.task.assign.scoped')
on conflict do nothing;

-- Field Worker: assigned ordinary visitor/follow-up; identity fields are redacted by default.
insert into public.role_capability(role_id,capability_id,scope_mode)
select r.id,c.id,'assigned' from public.role r cross join public.capability c
where r.code='field_worker' and c.code in (
'contact.capture.create','contact.read.scoped','contact.update.scoped','contact.note.create',
'contact.note.read.scoped','contact.interaction.record','followup.task.create',
'followup.task.read.scoped','followup.task.update.scoped')
on conflict do nothing;

-- Follow-up Volunteer: assigned visitor follow-up only; identity fields are redacted by default.
insert into public.role_capability(role_id,capability_id,scope_mode)
select r.id,c.id,'assigned' from public.role r cross join public.capability c
where r.code='follow_up_volunteer' and c.code in (
'contact.read.scoped','contact.note.create','contact.note.read.scoped',
'contact.interaction.record','followup.task.read.scoped',
'followup.task.update.scoped')
on conflict do nothing;

-- Restricted contact phone/email capabilities are Admin/Pastor-only in this baseline. Lower roles receive minimized contact projections. Prayer Intercessor intentionally has no visitor CRM grants. No exports,
-- SMS, prayer/care narrative access or capability-policy editing are granted.
comment on table public.role_capability is
'Least-privilege visitor-management MVP grants. Branch/team/assigned scope is enforced server-side by Edge Functions.';
commit;
