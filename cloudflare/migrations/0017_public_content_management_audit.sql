-- Add authorization and append-only audit for public church profile and external document links.
-- Also records lifecycle changes for all public-content entities.
-- Additive non-production migration 0017.

CREATE TABLE public_content_change_audit (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'church_public_profile','welcome_message','sermon','daily_word','digital_tract','external_document_link'
  )),
  entity_id TEXT NOT NULL,
  branch_id TEXT REFERENCES branch(id) ON DELETE RESTRICT,
  church_id TEXT REFERENCES church(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('created','updated','published','archived')),
  before_state TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(before_state) AND json_type(before_state)='object'),
  after_state TEXT NOT NULL CHECK(json_valid(after_state) AND json_type(after_state)='object'),
  created_at TEXT NOT NULL
);

CREATE INDEX public_content_audit_entity_idx
  ON public_content_change_audit(entity_type,entity_id,created_at DESC);
CREATE INDEX public_content_audit_actor_idx
  ON public_content_change_audit(actor_user_id,created_at DESC);

CREATE TRIGGER church_public_profile_authorize_insert
BEFORE INSERT ON church_public_profile
BEGIN
  SELECT CASE WHEN NEW.updated_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.church_id=NEW.church_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.updated_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
      AND rc.scope_mode='branch'
  ) THEN RAISE(ABORT,'CHURCH_PUBLIC_PROFILE_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER church_public_profile_authorize_update
BEFORE UPDATE ON church_public_profile
BEGIN
  SELECT CASE WHEN NEW.church_id<>OLD.church_id
    THEN RAISE(ABORT,'CHURCH_PUBLIC_PROFILE_CHURCH_IMMUTABLE') END;
  SELECT CASE WHEN NEW.updated_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.church_id=NEW.church_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.updated_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.updated_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.updated_at)
      AND rc.scope_mode='branch'
  ) THEN RAISE(ABORT,'CHURCH_PUBLIC_PROFILE_UPDATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER church_public_profile_no_delete
BEFORE DELETE ON church_public_profile
BEGIN
  SELECT RAISE(ABORT,'CHURCH_PUBLIC_PROFILE_DELETE_RESTRICTED');
END;

CREATE TRIGGER external_document_link_authorize_insert
BEFORE INSERT ON external_document_link
BEGIN
  SELECT CASE WHEN NEW.created_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
      AND rc.scope_mode='branch'
      AND (NEW.sermon_id IS NULL OR EXISTS (
        SELECT 1 FROM sermon s WHERE s.id=NEW.sermon_id AND (s.branch_id IS NULL OR s.branch_id=ra.branch_id)
      ))
  ) THEN RAISE(ABORT,'EXTERNAL_DOCUMENT_LINK_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER external_document_link_authorize_update
BEFORE UPDATE ON external_document_link
BEGIN
  SELECT CASE WHEN NEW.created_by<>OLD.created_by OR NEW.digital_tract_id IS NOT OLD.digital_tract_id
      OR NEW.sermon_id IS NOT OLD.sermon_id
    THEN RAISE(ABORT,'EXTERNAL_DOCUMENT_LINK_TARGET_IMMUTABLE') END;
  SELECT CASE WHEN NEW.updated_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.updated_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
      AND rc.scope_mode='branch'
  ) THEN RAISE(ABORT,'EXTERNAL_DOCUMENT_LINK_UPDATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER public_content_audit_profile_insert
AFTER INSERT ON church_public_profile
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,church_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'church_public_profile',NEW.id,NEW.church_id,
         actor.id,NEW.updated_by,'created','{}',
         json_object('public_name',NEW.public_name,'welcome_content',NEW.welcome_content,
          'public_phone',NEW.public_phone,'public_email',NEW.public_email,'address_text',NEW.address_text,
          'website_url',NEW.website_url,'social_links',json(NEW.social_links)),NEW.created_at
  FROM staff_profile actor WHERE actor.auth_user_id=NEW.updated_by;
END;

CREATE TRIGGER public_content_audit_profile_update
AFTER UPDATE ON church_public_profile
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,church_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'church_public_profile',NEW.id,NEW.church_id,
         actor.id,NEW.updated_by,'updated',
         json_object('public_name',OLD.public_name,'welcome_content',OLD.welcome_content,
          'public_phone',OLD.public_phone,'public_email',OLD.public_email,'address_text',OLD.address_text,
          'website_url',OLD.website_url,'social_links',json(OLD.social_links)),
         json_object('public_name',NEW.public_name,'welcome_content',NEW.welcome_content,
          'public_phone',NEW.public_phone,'public_email',NEW.public_email,'address_text',NEW.address_text,
          'website_url',NEW.website_url,'social_links',json(NEW.social_links)),NEW.updated_at
  FROM staff_profile actor WHERE actor.auth_user_id=NEW.updated_by;
END;

CREATE TRIGGER public_content_audit_welcome_insert
AFTER INSERT ON welcome_message
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,branch_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'welcome_message',NEW.id,NEW.branch_id,
         actor.id,NEW.created_by,'created','{}',
         json_object('title',NEW.title,'body',NEW.body,'display_order',NEW.display_order,'status',NEW.status,'published_at',NEW.published_at),
         NEW.created_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.created_by;
END;

CREATE TRIGGER public_content_audit_welcome_update
AFTER UPDATE ON welcome_message
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,branch_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'welcome_message',NEW.id,NEW.branch_id,
         actor.id,NEW.updated_by,
         CASE WHEN OLD.status<>'published' AND NEW.status='published' THEN 'published'
              WHEN OLD.status<>'archived' AND NEW.status='archived' THEN 'archived' ELSE 'updated' END,
         json_object('title',OLD.title,'body',OLD.body,'display_order',OLD.display_order,'status',OLD.status,'published_at',OLD.published_at),
         json_object('title',NEW.title,'body',NEW.body,'display_order',NEW.display_order,'status',NEW.status,'published_at',NEW.published_at),
         NEW.updated_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.updated_by;
END;

CREATE TRIGGER public_content_audit_sermon_insert
AFTER INSERT ON sermon
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,branch_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'sermon',NEW.id,NEW.branch_id,
         actor.id,NEW.created_by,'created','{}',
         json_object('title',NEW.title,'body',NEW.body,'public_slug',NEW.public_slug,'status',NEW.status,'published_at',NEW.published_at),
         NEW.created_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.created_by;
END;

CREATE TRIGGER public_content_audit_sermon_update
AFTER UPDATE ON sermon
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,branch_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'sermon',NEW.id,NEW.branch_id,
         actor.id,NEW.updated_by,
         CASE WHEN OLD.status<>'published' AND NEW.status='published' THEN 'published'
              WHEN OLD.status<>'archived' AND NEW.status='archived' THEN 'archived' ELSE 'updated' END,
         json_object('title',OLD.title,'body',OLD.body,'public_slug',OLD.public_slug,'status',OLD.status,'published_at',OLD.published_at),
         json_object('title',NEW.title,'body',NEW.body,'public_slug',NEW.public_slug,'status',NEW.status,'published_at',NEW.published_at),
         NEW.updated_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.updated_by;
END;

CREATE TRIGGER public_content_audit_daily_word_insert
AFTER INSERT ON daily_word
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'daily_word',NEW.id,
         actor.id,NEW.created_by,'created','{}',
         json_object('title',NEW.title,'body',NEW.body,'publication_date',NEW.publication_date,'public_slug',NEW.public_slug,'status',NEW.status,'published_at',NEW.published_at),
         NEW.created_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.created_by;
END;

CREATE TRIGGER public_content_audit_daily_word_update
AFTER UPDATE ON daily_word
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'daily_word',NEW.id,
         actor.id,NEW.updated_by,
         CASE WHEN OLD.status<>'published' AND NEW.status='published' THEN 'published'
              WHEN OLD.status<>'archived' AND NEW.status='archived' THEN 'archived' ELSE 'updated' END,
         json_object('title',OLD.title,'body',OLD.body,'publication_date',OLD.publication_date,'public_slug',OLD.public_slug,'status',OLD.status,'published_at',OLD.published_at),
         json_object('title',NEW.title,'body',NEW.body,'publication_date',NEW.publication_date,'public_slug',NEW.public_slug,'status',NEW.status,'published_at',NEW.published_at),
         NEW.updated_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.updated_by;
END;

CREATE TRIGGER public_content_audit_tract_insert
AFTER INSERT ON digital_tract
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'digital_tract',NEW.id,
         actor.id,NEW.created_by,'created','{}',
         json_object('title',NEW.title,'body',NEW.body,'public_slug',NEW.public_slug,'status',NEW.status,'published_at',NEW.published_at),
         NEW.created_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.created_by;
END;

CREATE TRIGGER public_content_audit_tract_update
AFTER UPDATE ON digital_tract
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'digital_tract',NEW.id,
         actor.id,NEW.updated_by,
         CASE WHEN OLD.status<>'published' AND NEW.status='published' THEN 'published'
              WHEN OLD.status<>'archived' AND NEW.status='archived' THEN 'archived' ELSE 'updated' END,
         json_object('title',OLD.title,'body',OLD.body,'public_slug',OLD.public_slug,'status',OLD.status,'published_at',OLD.published_at),
         json_object('title',NEW.title,'body',NEW.body,'public_slug',NEW.public_slug,'status',NEW.status,'published_at',NEW.published_at),
         NEW.updated_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.updated_by;
END;

CREATE TRIGGER public_content_audit_link_insert
AFTER INSERT ON external_document_link
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'external_document_link',NEW.id,
         actor.id,NEW.created_by,'created','{}',
         json_object('label',NEW.label,'url',NEW.url,'digital_tract_id',NEW.digital_tract_id,'sermon_id',NEW.sermon_id),
         NEW.created_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.created_by;
END;

CREATE TRIGGER public_content_audit_link_update
AFTER UPDATE ON external_document_link
BEGIN
  INSERT INTO public_content_change_audit
    (id,entity_type,entity_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT 'public-content-'||lower(hex(randomblob(16))),'external_document_link',NEW.id,
         actor.id,NEW.updated_by,'updated',
         json_object('label',OLD.label,'url',OLD.url,'digital_tract_id',OLD.digital_tract_id,'sermon_id',OLD.sermon_id),
         json_object('label',NEW.label,'url',NEW.url,'digital_tract_id',NEW.digital_tract_id,'sermon_id',NEW.sermon_id),
         NEW.created_at FROM staff_profile actor WHERE actor.auth_user_id=NEW.updated_by;
END;

CREATE TRIGGER public_content_audit_no_update
BEFORE UPDATE ON public_content_change_audit
BEGIN
  SELECT RAISE(ABORT,'PUBLIC_CONTENT_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER public_content_audit_no_delete
BEFORE DELETE ON public_content_change_audit
BEGIN
  SELECT RAISE(ABORT,'PUBLIC_CONTENT_AUDIT_APPEND_ONLY');
END;

UPDATE app_meta SET schema_version=17 WHERE id=1 AND environment='non-production';
