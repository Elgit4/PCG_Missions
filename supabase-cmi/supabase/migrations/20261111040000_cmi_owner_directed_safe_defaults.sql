-- PCG Missions CMI — owner-directed safe-default authorization baseline.
-- This is a forward migration: do not rewrite previously versioned migrations.
-- Product owner selected conservative defaults for R-01..R-12 and D-01..D-13
-- on 11 November 2026. Church policy may amend these through change control.
--
-- No hosted production mutation is authorized by merging this source branch.

begin;

-- Contact identity fields are restricted to Admin/Pastor. Remove the legacy
-- lower-role grants from the original visitor MVP migration. The original
-- Admin/Pastor branch-scoped identity grants remain intact.
delete from public.role_capability rc
using public.role r, public.capability c
where rc.role_id = r.id
  and rc.capability_id = c.id
  and r.code in (
    'coordinator',
    'team_leader',
    'field_worker',
    'follow_up_volunteer'
  )
  and c.code in (
    'contact.identity.capture',
    'contact.identity.read.scoped',
    'contact.identity.update.scoped'
  );

-- Prayer Intercessor can read only an actively assigned request. No creation,
-- update, assignment, linked-contact identity or unassigned discovery.
insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'assigned'
from public.role r
cross join public.capability c
where r.code = 'prayer_intercessor'
  and c.code = 'prayer.request.read.assigned'
on conflict do nothing;

-- Admin/Pastor oversight is separate from ordinary role access. The pastoral
-- read RPCs enforce allowlisted reasons and append-only audit in one transaction.
insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'oversight'
from public.role r
cross join public.capability c
where r.code = 'admin_pastor'
  and c.code in ('prayer.oversight.read', 'care.oversight.read')
on conflict do nothing;

-- D-08: offline mode is disabled for the initial release. Do not accept an
-- offline check-in source even if a client attempts to forge the request.
alter table public.event_checkin
  drop constraint if exists event_checkin_source_check;

alter table public.event_checkin
  add constraint event_checkin_source_check
  check (source in ('staff', 'event_workspace'));

comment on table public.role_capability is
'Owner-directed least-privilege baseline: 58 explicit grants. Contact phone/email identity is Admin/Pastor-only; lower roles receive minimized projections. Prayer Intercessor reads assigned request text only; Admin/Pastor pastoral oversight reads require reason codes and transactional audit.';

commit;
