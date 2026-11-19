-- Correct notification timing and keep inbox recipients in sync with assignment changes.
-- Scheduled event assignments notify only when they become active.
begin;

create or replace function private.cmi_notify_event_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_title text;
begin
  if new.revoked_at is null
     and new.starts_at <= now()
     and (new.ends_at is null or new.ends_at > now())
     and new.assignment_role <> 'transport'
     and new.staff_auth_user_id is distinct from new.assigned_by
     and exists (
       select 1 from public.staff_profile sp
       where sp.auth_user_id = new.staff_auth_user_id
         and sp.account_status = 'active'
     ) then
    select e.title into event_title
      from public.event e
     where e.id = new.event_id and e.branch_id = new.branch_id;

    if event_title is not null then
      insert into public.staff_notification (
        branch_id, recipient_user_id, category, title, body,
        target_type, target_id, idempotency_key
      ) values (
        new.branch_id,
        new.staff_auth_user_id,
        'event_assigned',
        'Event assignment updated',
        'You have been assigned to ' || left(event_title, 260) || '.',
        'event',
        new.event_id,
        'event-assignment:' || new.id::text || ':' || new.staff_auth_user_id::text
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.cmi_notify_event_team_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $event_team$
declare
  event_title text;
begin
  if new.revoked_at is null
     and new.starts_at <= now()
     and (new.ends_at is null or new.ends_at > now())
     and new.assignment_role <> 'transport' then
    select e.title into event_title
      from public.event e
     where e.id = new.event_id and e.branch_id = new.branch_id;

    if event_title is not null then
      insert into public.staff_notification (
        branch_id, recipient_user_id, category, title, body,
        target_type, target_id, idempotency_key
      )
      select new.branch_id, sp.auth_user_id, 'event_assigned',
        'Team event assignment updated',
        'Your team has been assigned to ' || left(event_title, 260) || '.',
        'event', new.event_id,
        'event-team-assignment:' || new.id::text || ':' || sp.auth_user_id::text
      from public.staff_team_membership stm
      join public.staff_profile sp on sp.id = stm.staff_profile_id
      where stm.team_id = new.team_id
        and stm.branch_id = new.branch_id
        and stm.starts_at <= now()
        and (stm.ends_at is null or stm.ends_at > now())
        and stm.revoked_at is null
        and sp.account_status = 'active'
        and sp.auth_user_id is distinct from new.assigned_by
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$event_team$;

drop trigger if exists event_staff_assignment_notify on public.event_staff_assignment;
drop trigger if exists event_staff_assignment_notify_update on public.event_staff_assignment;
create trigger event_staff_assignment_notify
after insert on public.event_staff_assignment
for each row execute function private.cmi_notify_event_assignment();
create trigger event_staff_assignment_notify_update
after update of staff_auth_user_id, starts_at, ends_at, revoked_at
on public.event_staff_assignment
for each row execute function private.cmi_notify_event_assignment();

drop trigger if exists event_team_assignment_notify on public.event_team_assignment;
drop trigger if exists event_team_assignment_notify_update on public.event_team_assignment;
create trigger event_team_assignment_notify
after insert on public.event_team_assignment
for each row execute function private.cmi_notify_event_team_assignment();
create trigger event_team_assignment_notify_update
after update of team_id, starts_at, ends_at, revoked_at
on public.event_team_assignment
for each row execute function private.cmi_notify_event_team_assignment();

revoke all on function private.cmi_notify_event_assignment()
  from public, anon, authenticated, service_role;
revoke all on function private.cmi_notify_event_team_assignment()
  from public, anon, authenticated, service_role;

commit;
