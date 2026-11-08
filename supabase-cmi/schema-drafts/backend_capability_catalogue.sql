-- CMI Follow-up v2.1 — capability catalogue and safe contact creation transaction.
-- Capability definitions are a technical catalogue only. No role_capability
-- grants are inserted here. R-01..R-12 and D-01 remain pending approval.
-- This file is validated by isolated CI and is not deployed to a hosted project.

begin;

insert into public.capability (code, description, sensitivity) values
  ('staff.directory.read', 'Read permitted staff directory fields.', 'ordinary'),
  ('staff.account.manage', 'Provision, activate/deactivate and initiate secure credential reset or reissue.', 'restricted'),
  ('access.role.assign', 'Assign and revoke staff role assignments.', 'highly_restricted'),
  ('access.capability.manage', 'Maintain capability grants and policy configuration.', 'highly_restricted'),
  ('team.manage', 'Manage teams and team memberships.', 'ordinary'),
  ('area.manage', 'Configure service areas and staff coverage.', 'ordinary'),
  ('contact.capture.create', 'Create a field capture through an approved staff workflow.', 'ordinary'),
  ('contact.read.scoped', 'Read ordinary contact fields within approved scope.', 'ordinary'),
  ('contact.update.scoped', 'Update ordinary contact fields within approved scope.', 'ordinary'),
  ('contact.merge', 'Merge duplicate contacts through an audited transaction.', 'restricted'),
  ('contact.export.scoped', 'Export authorized minimized contact fields.', 'restricted'),
  ('contact.identity.capture', 'Capture contact phone and email identifiers where explicitly approved.', 'restricted'),
  ('contact.identity.read.scoped', 'Read contact phone and email identifiers within approved scope.', 'restricted'),
  ('contact.identity.update.scoped', 'Update contact phone and email identifiers within approved scope.', 'restricted'),
  ('contact.note.create', 'Add ordinary non-sensitive contact notes.', 'ordinary'),
  ('contact.note.read.scoped', 'Read ordinary contact notes within visibility scope.', 'ordinary'),
  ('contact.interaction.record', 'Record contact calls, visits and follow-up outcomes.', 'ordinary'),
  ('contact.assign.scoped', 'Assign and reassign contacts within approved scope.', 'ordinary'),
  ('followup.task.create', 'Create a follow-up task for an in-scope contact.', 'ordinary'),
  ('followup.task.read.scoped', 'Read follow-up tasks within assignment or team scope.', 'ordinary'),
  ('followup.task.update.scoped', 'Update permitted follow-up task fields and status.', 'ordinary'),
  ('followup.task.assign.scoped', 'Assign and reassign follow-up tasks within scope.', 'ordinary'),
  ('prayer.request.create', 'Create a prayer request through an approved workflow.', 'restricted'),
  ('prayer.request.read.assigned', 'Read prayer requests actively assigned to the requester.', 'highly_restricted'),
  ('prayer.request.update.assigned', 'Update permitted fields on an assigned prayer request.', 'highly_restricted'),
  ('prayer.manage.scoped', 'Coordinate prayer assignment and workflow metadata without implying narrative access.', 'restricted'),
  ('prayer.oversight.read', 'Read restricted prayer narratives through audited privileged oversight.', 'highly_restricted'),
  ('prayer.oversight.manage', 'Manage prayer requests through audited privileged oversight.', 'highly_restricted'),
  ('care.directory.read.scoped', 'Read care groups and directory entries within approved scope.', 'restricted'),
  ('care.record.read.assigned', 'Read care records assigned to the requester.', 'highly_restricted'),
  ('care.record.update.assigned', 'Update assigned care status and interactions.', 'highly_restricted'),
  ('care.oversight.read', 'Read restricted care records through audited privileged oversight.', 'highly_restricted'),
  ('care.oversight.manage', 'Manage care records through audited privileged oversight.', 'highly_restricted'),
  ('event.read.scoped', 'Read events within branch or event assignment scope.', 'ordinary'),
  ('event.manage.scoped', 'Create and update events within authorized scope.', 'ordinary'),
  ('event.registration.manage.scoped', 'Manage registrations within an authorized event.', 'restricted'),
  ('event.checkin.scoped', 'Record attendance at an authorized event.', 'restricted'),
  ('event.closeout.submit', 'Submit event closeout for an authorized event.', 'ordinary'),
  ('event.closeout.review', 'Review event closeout within approved authority.', 'restricted'),
  ('calendar.manage.scoped', 'Manage calendar entries within approved scope.', 'ordinary'),
  ('calendar.read.scoped', 'Read calendar entries within approved scope.', 'ordinary'),
  ('announcement.create.scoped', 'Draft announcements for an authorized audience.', 'ordinary'),
  ('announcement.read.scoped', 'Read announcements for authorized audiences.', 'ordinary'),
  ('announcement.publish.scoped', 'Publish announcements to an authorized audience.', 'restricted'),
  ('sms.individual.send.scoped', 'Send an individual SMS to an eligible in-scope recipient.', 'restricted'),
  ('sms.campaign.create.scoped', 'Create and preview a bulk SMS campaign.', 'restricted'),
  ('sms.campaign.approve', 'Approve a bulk SMS campaign.', 'highly_restricted'),
  ('sms.campaign.send.scoped', 'Dispatch an approved campaign within scope and spend limits.', 'highly_restricted'),
  ('sms.automation.configure', 'Configure approved SMS automation rules and templates.', 'highly_restricted'),
  ('sms.automation.pause', 'Pause or disable an SMS automation rule.', 'restricted'),
  ('sms.delivery.read.scoped', 'Read permitted SMS delivery metadata.', 'restricted'),
  ('sms.provider.configure', 'Configure server-side SMS provider and sender settings.', 'highly_restricted'),
  ('content.manage.draft', 'Create and edit unpublished visitor content.', 'ordinary'),
  ('content.publish', 'Publish and hide visitor-facing content.', 'restricted'),
  ('report.submit.scoped', 'Submit permitted ministry reports.', 'ordinary'),
  ('report.read.scoped', 'Read reports within author, team or event scope.', 'ordinary'),
  ('report.review.scoped', 'Review, approve or return reports within authority.', 'restricted'),
  ('report.export.scoped', 'Export authorized report data.', 'restricted'),
  ('audit.read.privileged', 'Read privileged audit metadata.', 'highly_restricted'),
  ('church.settings.manage', 'Maintain church profile and operational settings.', 'restricted')
on conflict (code) do update
set description = excluded.description,
    sensitivity = excluded.sensitivity;

-- A fixed, server-only transaction for staff contact capture. The actor ID
-- must come from a JWT verified by Supabase Auth in the Edge Function. This
-- function independently validates the active staff profile, branch and
-- approved capability before writing. It does not grant browser access.
create or replace function public.cmi_create_contact(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_client_request_id uuid,
  p_digest_key_version smallint,
  p_request_digest bytea,
  p_first_name text,
  p_last_name text,
  p_preferred_name text,
  p_phone_e164 text,
  p_phone_display text,
  p_email_normalized text,
  p_age_range text,
  p_preferred_language text,
  p_service_area_id uuid,
  p_team_id uuid,
  p_source_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
  v_branch_scope boolean := false;
  v_assigned_scope boolean := false;
  v_team_scope boolean := false;
  v_existing_contact_id uuid;
  v_existing_actor uuid;
  v_existing_digest_key_version smallint;
  v_existing_request_digest bytea;
  v_contact public.contact%rowtype;
begin
  if p_actor_auth_user_id is null
     or p_branch_id is null
     or p_client_request_id is null
     or p_digest_key_version is null or p_digest_key_version < 1
     or p_request_digest is null or pg_catalog.octet_length(p_request_digest) <> 32
     or length(pg_catalog.btrim(coalesce(p_first_name, ''))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid contact capture input';
  end if;

  if p_source_metadata is null or pg_catalog.jsonb_typeof(p_source_metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid capture metadata';
  end if;

  if p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'invalid phone format';
  end if;

  if p_email_normalized is not null and (
    p_email_normalized <> pg_catalog.lower(pg_catalog.btrim(p_email_normalized))
    or p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception using errcode = '22023', message = 'invalid email format';
  end if;

  if p_source_metadata - array['app_version', 'form_version', 'device_type', 'locale'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'unsupported capture metadata';
  end if;

  select
    sp.id,
    pg_catalog.bool_or(rc.scope_mode = 'branch'),
    pg_catalog.bool_or(rc.scope_mode = 'assigned'),
    pg_catalog.bool_or(rc.scope_mode = 'team')
  into
    v_profile_id,
    v_branch_scope,
    v_assigned_scope,
    v_team_scope
  from public.staff_profile sp
  join public.staff_role_assignment sra
    on sra.staff_profile_id = sp.id
  join public.role r
    on r.id = sra.role_id
   and r.is_active
  join public.role_capability rc
    on rc.role_id = sra.role_id
  join public.capability cap
    on cap.id = rc.capability_id
  join public.branch b
    on b.id = sra.branch_id
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active'
    and sra.branch_id = p_branch_id
    and sra.starts_at <= pg_catalog.now()
    and sra.ends_at is null
    and sra.revoked_at is null
    and b.is_active
    and cap.code = 'contact.capture.create'
    and cap.is_active
    and rc.scope_mode in ('branch', 'assigned', 'team')
  group by sp.id;

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'contact capture not authorized';
  end if;

  if (p_phone_e164 is not null or p_phone_display is not null or p_email_normalized is not null)
     and not exists (
       select 1
       from public.staff_role_assignment sra
       join public.role r on r.id = sra.role_id and r.is_active
       join public.role_capability rc on rc.role_id = sra.role_id
       join public.capability cap on cap.id = rc.capability_id
       where sra.staff_profile_id = v_profile_id
         and sra.branch_id = p_branch_id
         and sra.starts_at <= pg_catalog.now()
         and sra.ends_at is null
         and sra.revoked_at is null
         and cap.code = 'contact.identity.capture'
         and cap.is_active
     ) then
    raise exception using errcode = '42501', message = 'contact identity capture not authorized';
  end if;

  if p_team_id is not null then
    if not v_team_scope or not exists (
      select 1
      from public.staff_team_membership stm
      join public.team t
        on t.id = stm.team_id
       and t.branch_id = stm.branch_id
       and t.is_active
      where stm.staff_profile_id = v_profile_id
        and stm.branch_id = p_branch_id
        and stm.team_id = p_team_id
        and stm.starts_at <= pg_catalog.now()
        and stm.ends_at is null
        and stm.revoked_at is null
    ) then
      raise exception using errcode = '42501', message = 'team contact capture not authorized';
    end if;
  elsif not v_branch_scope and not v_assigned_scope then
    raise exception using errcode = '22023', message = 'team_id is required for team-scoped capture';
  end if;

  -- Serialize requests that share the same branch/idempotency key. This makes
  -- the contact, assignment and capture provenance an atomic replay-safe write.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_branch_id::text || ':' || p_client_request_id::text, 0)
  );

  select cc.contact_id, cc.captured_by, cc.digest_key_version, cc.request_digest
    into v_existing_contact_id, v_existing_actor, v_existing_digest_key_version, v_existing_request_digest
  from public.contact_capture cc
  where cc.branch_id = p_branch_id
    and cc.client_request_id = p_client_request_id
  for update;

  if v_existing_contact_id is not null then
    if v_existing_actor is distinct from p_actor_auth_user_id
       or v_existing_digest_key_version is distinct from p_digest_key_version
       or v_existing_request_digest is distinct from p_request_digest then
      raise exception using errcode = '23505', message = 'idempotency key already used';
    end if;

    select c.*
      into v_contact
    from public.contact c
    where c.id = v_existing_contact_id
      and c.branch_id = p_branch_id;

    return pg_catalog.jsonb_build_object(
      'contact', pg_catalog.to_jsonb(v_contact),
      'replayed', true
    );
  end if;

  insert into public.contact (
    branch_id,
    first_name,
    last_name,
    preferred_name,
    phone_e164,
    phone_display,
    email_normalized,
    age_range,
    preferred_language,
    created_by
  ) values (
    p_branch_id,
    pg_catalog.btrim(p_first_name),
    nullif(pg_catalog.btrim(coalesce(p_last_name, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_preferred_name, '')), ''),
    p_phone_e164,
    p_phone_display,
    p_email_normalized,
    p_age_range,
    p_preferred_language,
    p_actor_auth_user_id
  )
  returning * into v_contact;

  if p_team_id is not null or (not v_branch_scope and v_assigned_scope) then
    insert into public.contact_assignment (
      contact_id,
      branch_id,
      assignee_user_id,
      team_id,
      assigned_by
    ) values (
      v_contact.id,
      p_branch_id,
      case when p_team_id is null then p_actor_auth_user_id else null end,
      p_team_id,
      p_actor_auth_user_id
    );
  end if;

  insert into public.contact_capture (
    contact_id,
    branch_id,
    captured_by,
    capture_source,
    service_area_id,
    client_request_id,
    digest_key_version,
    request_digest,
    source_metadata
  ) values (
    v_contact.id,
    p_branch_id,
    p_actor_auth_user_id,
    'staff_manual',
    p_service_area_id,
    p_client_request_id,
    p_digest_key_version,
    p_request_digest,
    p_source_metadata
  );

  return pg_catalog.jsonb_build_object(
    'contact', pg_catalog.to_jsonb(v_contact),
    'replayed', false
  );
end;
$$;

revoke all on function public.cmi_create_contact(
  uuid, uuid, uuid, smallint, bytea, text, text, text, text, text, text, text, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.cmi_create_contact(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, uuid, jsonb
) to service_role;

comment on function public.cmi_create_contact(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, uuid, jsonb
) is 'Atomic staff contact capture with validated actor, branch, capability and team/self assignment. Execute only from the verified CMI Edge Function service.';

commit;
