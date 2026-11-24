-- PCG Missions — branch-scoped Admin/Pastor draft workspace permissions.
-- Product-owner instruction on 12 November 2026: make the existing safe
-- private-draft Event, Calendar, Announcement and visitor-content operations
-- usable from the staff workspace. This grants draft-only, branch-scoped
-- capabilities to Admin/Pastor; it does not enable publication, registration,
-- check-in, closeout, exports, team administration, pastoral mutation or SMS.

begin;

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'branch'
from public.role r
cross join public.capability c
where r.code = 'admin_pastor'
  and c.is_active
  and c.code in (
    'event.read.scoped',
    'event.manage.scoped',
    'calendar.read.scoped',
    'calendar.manage.scoped',
    'announcement.read.scoped',
    'announcement.create.scoped',
    'content.manage.draft'
  )
on conflict do nothing;

do $$
declare
  granted_count integer;
begin
  select count(*)::integer
  into granted_count
  from public.role_capability rc
  join public.role r on r.id = rc.role_id
  join public.capability c on c.id = rc.capability_id
  where r.code = 'admin_pastor'
    and rc.scope_mode = 'branch'
    and c.code in (
      'event.read.scoped',
      'event.manage.scoped',
      'calendar.read.scoped',
      'calendar.manage.scoped',
      'announcement.read.scoped',
      'announcement.create.scoped',
      'content.manage.draft'
    )
    and c.is_active;

  if granted_count <> 7 then
    raise exception 'Expected seven active Admin/Pastor branch draft grants, found %', granted_count;
  end if;
end;
$$;

comment on table public.role_capability is
'Least-privilege authorization baseline: 65 explicit grants across six roles. Admin/Pastor receives branch-scoped event, calendar, announcement and unpublished visitor-content draft capabilities only; publication, public registration, attendance, exports, SMS and pastoral mutation remain ungranted. Contact identity and pastoral oversight remain separately permissioned and audited.';

commit;
