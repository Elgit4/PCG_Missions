-- PCG Missions CMI — report workflow authorization and atomic review.
-- D-12 role defaults; no export capability is introduced.
begin;

insert into public.capability(code, description, sensitivity, is_active) values
  ('report.read.own', 'Read reports authored by the authenticated staff member.', 'ordinary', true),
  ('report.submit.own', 'Create and submit typed reports for the authenticated staff member.', 'ordinary', true),
  ('report.review.branch', 'Review submitted ministry reports across the active branch.', 'ordinary', true),
  ('report.review.team', 'Review submitted ministry reports for active own-team membership.', 'ordinary', true)
on conflict (code) do update
set description = excluded.description,
    sensitivity = excluded.sensitivity,
    is_active = excluded.is_active;

-- Admin/Pastor and Coordinator: branch-wide review.
insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'branch'
from public.role r
cross join public.capability c
where r.code in ('admin_pastor', 'coordinator')
  and c.code = 'report.review.branch'
on conflict do nothing;

-- Team Leader: own reports plus active own-team review.
insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, scope.scope_mode
from public.role r
cross join public.capability c
cross join (values ('self'::text), ('team'::text)) as scope(scope_mode)
where r.code = 'team_leader'
  and c.code in ('report.read.own', 'report.submit.own')
on conflict do nothing;

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'team'
from public.role r
cross join public.capability c
where r.code = 'team_leader'
  and c.code = 'report.review.team'
on conflict do nothing;

-- Field Worker and Follow-up Volunteer: own reports only.
insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'self'
from public.role r
cross join public.capability c
where r.code in ('field_worker', 'follow_up_volunteer')
  and c.code in ('report.read.own', 'report.submit.own')
on conflict do nothing;

-- Prayer Intercessor deliberately receives no report capability.
-- No report export capability exists or is granted.

create or replace function public.cmi_review_ministry_report(
  p_report_id uuid,
  p_reviewer_profile_id uuid,
  p_decision text,
  p_comment text default null
)
returns public.ministry_report
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.ministry_report;
begin
  if p_decision not in ('approved', 'returned', 'comment') then
    raise exception using errcode = '22023', message = 'INVALID_REPORT_DECISION';
  end if;
  if p_comment is not null and length(p_comment) > 2000 then
    raise exception using errcode = '22023', message = 'REPORT_COMMENT_TOO_LONG';
  end if;

  select * into v_report
  from public.ministry_report
  where id = p_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REPORT_NOT_FOUND';
  end if;
  if v_report.author_profile_id = p_reviewer_profile_id then
    raise exception using errcode = '42501', message = 'REPORT_SELF_REVIEW_FORBIDDEN';
  end if;
  if v_report.status <> 'submitted' then
    raise exception using errcode = '55000', message = 'REPORT_NOT_SUBMITTED';
  end if;

  if p_decision in ('approved', 'returned') then
    update public.ministry_report
    set status = p_decision, updated_at = pg_catalog.clock_timestamp()
    where id = p_report_id
    returning * into v_report;
  end if;

  insert into public.report_review_event(
    report_id, reviewer_profile_id, decision, comment
  ) values (
    p_report_id, p_reviewer_profile_id, p_decision, nullif(btrim(p_comment), '')
  );

  return v_report;
end;
$$;

revoke all on function public.cmi_review_ministry_report(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.cmi_review_ministry_report(uuid, uuid, text, text)
  to service_role;

commit;
