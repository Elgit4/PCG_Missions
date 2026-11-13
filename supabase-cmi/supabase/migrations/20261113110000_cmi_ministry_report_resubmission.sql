-- PCG Missions CMI — safe correction and resubmission of returned reports.
begin;

create or replace function public.cmi_resubmit_ministry_report(
  p_report_id uuid,
  p_author_profile_id uuid,
  p_contacts_captured integer,
  p_gospel_presentations integer,
  p_decisions_for_christ integer,
  p_followup_required integer,
  p_followup_completed integer,
  p_visits_completed integer,
  p_calls_completed integer,
  p_events_supported integer,
  p_attendance_count integer
)
returns public.ministry_report
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.ministry_report;
begin
  select * into v_report
  from public.ministry_report
  where id = p_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REPORT_NOT_FOUND';
  end if;
  if v_report.author_profile_id <> p_author_profile_id then
    raise exception using errcode = '42501', message = 'REPORT_AUTHOR_MISMATCH';
  end if;
  if v_report.status <> 'returned' then
    raise exception using errcode = '55000', message = 'REPORT_NOT_RETURNED';
  end if;
  if p_contacts_captured < 0 or p_gospel_presentations < 0
    or p_decisions_for_christ < 0 or p_followup_required < 0
    or p_followup_completed < 0 or p_visits_completed < 0
    or p_calls_completed < 0 or p_events_supported < 0
    or p_attendance_count < 0 then
    raise exception using errcode = '23514', message = 'REPORT_COUNTS_INVALID';
  end if;

  update public.ministry_report
  set contacts_captured = p_contacts_captured,
      gospel_presentations = p_gospel_presentations,
      decisions_for_christ = p_decisions_for_christ,
      followup_required = p_followup_required,
      followup_completed = p_followup_completed,
      visits_completed = p_visits_completed,
      calls_completed = p_calls_completed,
      events_supported = p_events_supported,
      attendance_count = p_attendance_count,
      status = 'submitted',
      submitted_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

revoke all on function public.cmi_resubmit_ministry_report(
  uuid,uuid,integer,integer,integer,integer,integer,integer,integer,integer,integer
) from public, anon, authenticated;
grant execute on function public.cmi_resubmit_ministry_report(
  uuid,uuid,integer,integer,integer,integer,integer,integer,integer,integer,integer
) to service_role;

commit;
