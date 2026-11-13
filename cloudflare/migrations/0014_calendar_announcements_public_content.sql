-- Calendar, announcements and public content.
-- Public projections must select published rows only. No SMS/email delivery is enabled.

CREATE TABLE calendar_entry (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 entry_type TEXT NOT NULL CHECK(entry_type IN ('service','event','followup','prayer_schedule','other')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 starts_at TEXT NOT NULL,
 ends_at TEXT,
 timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
 scope_type TEXT NOT NULL CHECK(scope_type IN ('branch','team','event','own')),
 team_id TEXT,
 event_id TEXT,
 owner_user_id TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR ends_at>starts_at),
 CHECK(
  (scope_type='branch' AND team_id IS NULL AND event_id IS NULL AND owner_user_id IS NULL)
  OR (scope_type='team' AND team_id IS NOT NULL AND event_id IS NULL AND owner_user_id IS NULL)
  OR (scope_type='event' AND team_id IS NULL AND event_id IS NOT NULL AND owner_user_id IS NULL)
  OR (scope_type='own' AND team_id IS NULL AND event_id IS NULL AND owner_user_id=created_by)
 ),
 FOREIGN KEY(team_id,branch_id) REFERENCES team(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT
);
CREATE INDEX calendar_branch_time_idx ON calendar_entry(branch_id,starts_at,ends_at);
CREATE INDEX calendar_owner_time_idx ON calendar_entry(owner_user_id,starts_at) WHERE owner_user_id IS NOT NULL;

CREATE TRIGGER calendar_entry_authorize_insert
BEFORE INSERT ON calendar_entry
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='calendar.manage' AND c.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND (rc.scope_mode='branch' OR (rc.scope_mode='team' AND NEW.scope_type='team'
      AND EXISTS (SELECT 1 FROM staff_team_membership stm WHERE stm.staff_profile_id=actor.id
       AND stm.team_id=NEW.team_id AND stm.branch_id=NEW.branch_id AND stm.revoked_at IS NULL
       AND stm.starts_at<=NEW.created_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.created_at))))
 ) THEN RAISE(ABORT,'CALENDAR_ENTRY_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TABLE announcement (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 20000),
 audience_type TEXT NOT NULL CHECK(audience_type IN ('public','branch','team','event','staff')),
 is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','published','archived')),
 publish_at TEXT,
 published_at TEXT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((status='published' AND published_at IS NOT NULL) OR status<>'published'),
 CHECK(is_public=0 OR audience_type='public'),
 UNIQUE(id,branch_id)
);
CREATE INDEX announcement_branch_status_idx ON announcement(branch_id,status,created_at DESC);
CREATE INDEX announcement_public_idx ON announcement(published_at DESC) WHERE is_public=1 AND status='published';

CREATE TABLE announcement_team_audience (
 announcement_id TEXT NOT NULL,
 branch_id TEXT NOT NULL,
 team_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(announcement_id,team_id),
 FOREIGN KEY(announcement_id,branch_id) REFERENCES announcement(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(team_id,branch_id) REFERENCES team(id,branch_id) ON DELETE RESTRICT
);
CREATE TABLE announcement_event_audience (
 announcement_id TEXT NOT NULL,
 branch_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(announcement_id,event_id),
 FOREIGN KEY(announcement_id,branch_id) REFERENCES announcement(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT
);

CREATE TRIGGER announcement_authorize_insert
BEFORE INSERT ON announcement
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='announcements.manage' AND c.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND rc.scope_mode='branch'
 ) THEN RAISE(ABORT,'ANNOUNCEMENT_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TABLE announcement_delivery (
 id TEXT PRIMARY KEY,
 announcement_id TEXT NOT NULL REFERENCES announcement(id) ON DELETE RESTRICT,
 channel TEXT NOT NULL CHECK(channel='in_app'),
 recipient_ref TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','delivered','failed')),
 attempted_at TEXT,
 safe_error_code TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(announcement_id,channel,recipient_ref)
);

CREATE TABLE church_public_profile (
 id TEXT PRIMARY KEY,
 church_id TEXT NOT NULL UNIQUE REFERENCES church(id) ON DELETE RESTRICT,
 public_name TEXT NOT NULL CHECK(length(trim(public_name)) BETWEEN 2 AND 180),
 welcome_content TEXT,
 public_phone TEXT,
 public_email TEXT,
 address_text TEXT,
 website_url TEXT CHECK(website_url IS NULL OR substr(lower(website_url),1,8)='https://'),
 social_links TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(social_links) AND json_type(social_links)='object'),
 updated_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE TABLE welcome_message (
 id TEXT PRIMARY KEY,
 branch_id TEXT REFERENCES branch(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 body TEXT NOT NULL,
 display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order>=0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 published_at TEXT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((status='published' AND published_at IS NOT NULL) OR status<>'published')
);
CREATE INDEX welcome_message_public_idx ON welcome_message(display_order) WHERE status='published';

CREATE TABLE sermon (
 id TEXT PRIMARY KEY,
 branch_id TEXT REFERENCES branch(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 body TEXT NOT NULL,
 public_slug TEXT NOT NULL UNIQUE CHECK(length(trim(public_slug)) BETWEEN 2 AND 180),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 published_at TEXT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((status='published' AND published_at IS NOT NULL) OR status<>'published')
);
CREATE INDEX sermon_public_idx ON sermon(published_at DESC) WHERE status='published';

CREATE TABLE daily_word (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 body TEXT NOT NULL,
 publication_date TEXT NOT NULL CHECK(length(publication_date)=10),
 public_slug TEXT NOT NULL UNIQUE CHECK(length(trim(public_slug)) BETWEEN 2 AND 180),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 published_at TEXT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((status='published' AND published_at IS NOT NULL) OR status<>'published')
);
CREATE INDEX daily_word_public_date_idx ON daily_word(publication_date DESC) WHERE status='published';

CREATE TABLE digital_tract (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 body TEXT,
 public_slug TEXT NOT NULL UNIQUE CHECK(length(trim(public_slug)) BETWEEN 2 AND 180),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 published_at TEXT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((status='published' AND published_at IS NOT NULL) OR status<>'published')
);
CREATE INDEX digital_tract_public_idx ON digital_tract(published_at DESC) WHERE status='published';

CREATE TABLE external_document_link (
 id TEXT PRIMARY KEY,
 digital_tract_id TEXT REFERENCES digital_tract(id) ON DELETE RESTRICT,
 sermon_id TEXT REFERENCES sermon(id) ON DELETE RESTRICT,
 label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 2 AND 180),
 url TEXT NOT NULL CHECK(substr(lower(url),1,8)='https://'),
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 CHECK((digital_tract_id IS NOT NULL) <> (sermon_id IS NOT NULL))
);

CREATE TRIGGER public_content_authorize_insert
BEFORE INSERT ON welcome_message
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND (NEW.branch_id IS NULL OR ra.branch_id=NEW.branch_id)
   AND rc.scope_mode='branch'
 ) THEN RAISE(ABORT,'PUBLIC_CONTENT_CREATE_NOT_AUTHORIZED') END;
END;
CREATE TRIGGER sermon_authorize_insert
BEFORE INSERT ON sermon
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND (NEW.branch_id IS NULL OR ra.branch_id=NEW.branch_id)
   AND rc.scope_mode='branch'
 ) THEN RAISE(ABORT,'SERMON_CREATE_NOT_AUTHORIZED') END;
END;
CREATE TRIGGER daily_word_authorize_insert
BEFORE INSERT ON daily_word
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND rc.scope_mode='branch'
 ) THEN RAISE(ABORT,'DAILY_WORD_CREATE_NOT_AUTHORIZED') END;
END;
CREATE TRIGGER digital_tract_authorize_insert
BEFORE INSERT ON digital_tract
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='content.manage' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND rc.scope_mode='branch'
 ) THEN RAISE(ABORT,'DIGITAL_TRACT_CREATE_NOT_AUTHORIZED') END;
END;

UPDATE app_meta SET schema_version=14 WHERE id=1 AND environment='non-production';
