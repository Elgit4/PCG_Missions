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
select r.id, c.id, 'self'
from public.role r
cross join public.capability c
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
  v_can_review_branch boolean := false;
  v_can_review_team boolean := false;
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

  -- Re-check reviewer authority inside the same transaction that changes the
  -- report. This closes the API check/write race if a role or team assignment
  -- is revoked between the Edge Function lookup and this RPC.
  select exists (
    select 1
    from public.staff_role_assignment sra
    join public.staff_profile sp on sp.id = sra.staff_profile_id
      and sp.account_status = 'active' and not sp.must_change_password
    join public.role r on r.id = sra.role_id and r.is_active
    join public.role_capability rc on rc.role_id = r.id and rc.scope_mode = 'branch'
    join public.capability c on c.id = rc.capability_id
      and c.code = 'report.review.branch' and c.is_active
    where sra.staff_profile_id = p_reviewer_profile_id
      and sra.branch_id = v_report.branch_id
      and sra.starts_at <= pg_catalog.clock_timestamp()
      and (sra.ends_at is null or sra.ends_at > pg_catalog.clock_timestamp())
      and sra.revoked_at is null
  ) into v_can_review_branch;

  if not v_can_review_branch and v_report.team_id is not null then
    select exists (
      select 1
      from public.staff_role_assignment sra
      join public.staff_profile sp on sp.id = sra.staff_profile_id
        and sp.account_status = 'active' and not sp.must_change_password
      join public.role r on r.id = sra.role_id and r.is_active
      join public.role_capability rc on rc.role_id = r.id and rc.scope_mode = 'team'
      join public.capability c on c.id = rc.capability_id
        and c.code = 'report.review.team' and c.is_active
      join public.staff_team_membership stm
        on stm.staff_profile_id = sra.staff_profile_id
        and stm.branch_id = sra.branch_id
        and stm.team_id = v_report.team_id
        and stm.starts_at <= pg_catalog.clock_timestamp()
        and (stm.ends_at is null or stm.ends_at > pg_catalog.clock_timestamp())
        and stm.revoked_at is null
      join public.team t on t.id = stm.team_id
        and t.branch_id = stm.branch_id and t.is_active
      where sra.staff_profile_id = p_reviewer_profile_id
        and sra.branch_id = v_report.branch_id
        and sra.starts_at <= pg_catalog.clock_timestamp()
        and (sra.ends_at is null or sra.ends_at > pg_catalog.clock_timestamp())
        and sra.revoked_at is null
    ) into v_can_review_team;
  end if;

  if not v_can_review_branch and not v_can_review_team then
    raise exception using errcode = '42501', message = 'REPORT_REVIEW_SCOPE_REQUIRED';
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
    report_id, actor_profile_id, decision, comment
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
