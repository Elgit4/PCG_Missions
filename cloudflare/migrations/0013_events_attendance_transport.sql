-- Branch-scoped events, registrations, transport and attendance.
-- Public registration is deliberately not enabled by this schema migration.
-- Capacity, idempotency digest verification and state transitions are enforced by trusted Worker batches.

INSERT INTO capability(id,code,description,sensitivity,created_at) VALUES
 ('events.closeout.review','events.closeout.review','Review and approve event closeouts.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET description=excluded.description,sensitivity=excluded.sensitivity,is_active=1;
INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code='events.closeout.review'
WHERE r.code IN ('admin_pastor','coordinator');

CREATE TABLE event (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 description TEXT,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
 location TEXT,
 capacity INTEGER CHECK(capacity IS NULL OR capacity>0),
 registration_state TEXT NOT NULL DEFAULT 'closed' CHECK(registration_state IN ('closed','open')),
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','staff','private')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','cancelled','completed')),
 transport_enabled INTEGER NOT NULL DEFAULT 0 CHECK(transport_enabled IN (0,1)),
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(id,branch_id),
 CHECK(ends_at>starts_at),
 CHECK(timezone='Africa/Accra' OR length(timezone) BETWEEN 3 AND 64)
);
CREATE INDEX event_branch_schedule_idx ON event(branch_id,starts_at DESC);
CREATE INDEX event_public_schedule_idx ON event(starts_at) WHERE status='published' AND visibility='public';

CREATE TRIGGER event_authorize_insert
BEFORE INSERT ON event
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='events.manage' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
 ) THEN RAISE(ABORT,'EVENT_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TABLE event_staff_assignment (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 staff_auth_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 assignment_role TEXT NOT NULL DEFAULT 'support' CHECK(assignment_role IN ('owner','organizer','checkin','transport','support')),
 assigned_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 starts_at TEXT NOT NULL,
 ends_at TEXT,
 revoked_at TEXT,
 created_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR ends_at>starts_at),
 CHECK(revoked_at IS NULL OR revoked_at>=starts_at),
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX event_staff_assignment_active_idx ON event_staff_assignment(event_id,staff_auth_user_id,assignment_role) WHERE ends_at IS NULL AND revoked_at IS NULL;

CREATE TABLE event_team_assignment (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 team_id TEXT NOT NULL,
 assignment_role TEXT NOT NULL DEFAULT 'support' CHECK(assignment_role IN ('organizer','ushering','transport','support')),
 assigned_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 starts_at TEXT NOT NULL,
 ends_at TEXT,
 revoked_at TEXT,
 created_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR ends_at>starts_at),
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(team_id,branch_id) REFERENCES team(id,branch_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX event_team_assignment_active_idx ON event_team_assignment(event_id,team_id,assignment_role) WHERE ends_at IS NULL AND revoked_at IS NULL;

CREATE TABLE event_registration (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 contact_id TEXT,
 attendee_name_snapshot TEXT NOT NULL CHECK(length(trim(attendee_name_snapshot)) BETWEEN 2 AND 180),
 attendee_phone_snapshot TEXT CHECK(attendee_phone_snapshot IS NULL OR (length(attendee_phone_snapshot) BETWEEN 9 AND 16 AND substr(attendee_phone_snapshot,1,1)='+')),
 attendee_email_snapshot TEXT CHECK(attendee_email_snapshot IS NULL OR attendee_email_snapshot=lower(trim(attendee_email_snapshot))),
 registration_source TEXT NOT NULL CHECK(registration_source IN ('staff','event_workspace')),
 status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','cancelled','attended','no_show')),
 registered_at TEXT NOT NULL,
 client_request_id TEXT NOT NULL,
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(contact_id,branch_id) REFERENCES contact(id,branch_id) ON DELETE RESTRICT,
 UNIQUE(id,event_id,branch_id),
 UNIQUE(event_id,registration_source,client_request_id)
);
CREATE INDEX event_registration_status_idx ON event_registration(event_id,status,registered_at);
CREATE INDEX event_registration_contact_idx ON event_registration(contact_id) WHERE contact_id IS NOT NULL;

CREATE TABLE transport_option (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 2 AND 160),
 capacity INTEGER CHECK(capacity IS NULL OR capacity>0),
 is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
 created_at TEXT NOT NULL,
 UNIQUE(id,event_id,branch_id),
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT
);
CREATE TABLE transport_reservation (
 id TEXT PRIMARY KEY,
 registration_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 transport_option_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 pickup_area TEXT,
 seat_count INTEGER NOT NULL DEFAULT 1 CHECK(seat_count BETWEEN 1 AND 20),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','cancelled','boarded','no_show')),
 notes TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(registration_id,event_id,branch_id) REFERENCES event_registration(id,event_id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(transport_option_id,event_id,branch_id) REFERENCES transport_option(id,event_id,branch_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX transport_reservation_one_active_idx ON transport_reservation(registration_id,transport_option_id) WHERE status IN ('reserved','boarded');

CREATE TABLE event_checkin (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 registration_id TEXT,
 contact_id TEXT,
 attendee_name_snapshot TEXT,
 checked_in_at TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 source TEXT NOT NULL CHECK(source IN ('staff','event_workspace')),
 client_request_id TEXT NOT NULL,
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(registration_id,event_id,branch_id) REFERENCES event_registration(id,event_id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(contact_id,branch_id) REFERENCES contact(id,branch_id) ON DELETE RESTRICT,
 UNIQUE(event_id,client_request_id),
 CHECK(registration_id IS NOT NULL OR contact_id IS NOT NULL OR length(trim(COALESCE(attendee_name_snapshot,'')))>0)
);
CREATE UNIQUE INDEX event_checkin_registration_once_idx ON event_checkin(event_id,registration_id) WHERE registration_id IS NOT NULL;
CREATE INDEX event_checkin_event_time_idx ON event_checkin(event_id,checked_in_at DESC);

CREATE TRIGGER event_checkin_authorize_insert
BEFORE INSERT ON event_checkin
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code IN ('events.checkin','events.manage') AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.recorded_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.checked_in_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.checked_in_at)
   AND (
    rc.scope_mode='branch'
    OR EXISTS (
      SELECT 1 FROM event_staff_assignment esa
      WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
       AND esa.staff_auth_user_id=NEW.recorded_by AND esa.revoked_at IS NULL
       AND esa.starts_at<=NEW.checked_in_at AND (esa.ends_at IS NULL OR esa.ends_at>NEW.checked_in_at)
    )
    OR EXISTS (
      SELECT 1 FROM event_team_assignment eta
      JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
      WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
       AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
       AND eta.starts_at<=NEW.checked_in_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.checked_in_at)
       AND stm.starts_at<=NEW.checked_in_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.checked_in_at)
    )
   )
 ) THEN RAISE(ABORT,'EVENT_CHECKIN_NOT_AUTHORIZED') END;
END;

CREATE TABLE event_closeout (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 submitted_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 submitted_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 reviewed_at TEXT,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft','submitted','approved','returned')),
 attendee_count INTEGER CHECK(attendee_count IS NULL OR attendee_count>=0),
 registration_count INTEGER CHECK(registration_count IS NULL OR registration_count>=0),
 transport_seat_count INTEGER CHECK(transport_seat_count IS NULL OR transport_seat_count>=0),
 summary_notes TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT,
 UNIQUE(event_id,branch_id),
 CHECK((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE event_closeout_event (
 id TEXT PRIMARY KEY,
 closeout_id TEXT NOT NULL REFERENCES event_closeout(id) ON DELETE RESTRICT,
 actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('submitted','approved','returned','reopened')),
 details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details) AND json_type(details)='object'),
 created_at TEXT NOT NULL
);
CREATE TRIGGER event_closeout_event_no_update BEFORE UPDATE ON event_closeout_event BEGIN SELECT RAISE(ABORT,'EVENT_CLOSEOUT_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER event_closeout_event_no_delete BEFORE DELETE ON event_closeout_event BEGIN SELECT RAISE(ABORT,'EVENT_CLOSEOUT_EVENT_APPEND_ONLY'); END;

CREATE TABLE event_idempotency_receipt (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 operation TEXT NOT NULL CHECK(operation IN ('staff_registration','registration_cancel','transport_reservation','transport_cancel','event_checkin','closeout_submit','closeout_review')),
 caller_class TEXT NOT NULL DEFAULT 'staff' CHECK(caller_class='staff'),
 actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 idempotency_key TEXT NOT NULL,
 digest_key_version INTEGER NOT NULL DEFAULT 1 CHECK(digest_key_version>0),
 request_digest BLOB NOT NULL CHECK(length(request_digest)=32),
 resource_type TEXT NOT NULL CHECK(resource_type IN ('event_registration','transport_reservation','event_checkin','event_closeout')),
 resource_id TEXT NOT NULL,
 response_status INTEGER NOT NULL CHECK(response_status BETWEEN 200 AND 299),
 created_at TEXT NOT NULL,
 FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT,
 UNIQUE(event_id,operation,idempotency_key)
);
CREATE TRIGGER event_idempotency_receipt_no_update BEFORE UPDATE ON event_idempotency_receipt BEGIN SELECT RAISE(ABORT,'EVENT_IDEMPOTENCY_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER event_idempotency_receipt_no_delete BEFORE DELETE ON event_idempotency_receipt BEGIN SELECT RAISE(ABORT,'EVENT_IDEMPOTENCY_RECEIPT_IMMUTABLE'); END;


-- Attribute staff registrations and transport reservations to the authenticated actor.
ALTER TABLE event_registration ADD COLUMN created_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE transport_reservation ADD COLUMN created_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;

CREATE TRIGGER event_staff_assignment_authorize_insert
BEFORE INSERT ON event_staff_assignment
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='events.manage' AND c.is_active=1
  WHERE actor.auth_user_id=NEW.assigned_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
 ) THEN RAISE(ABORT,'EVENT_STAFF_ASSIGNMENT_NOT_AUTHORIZED') END;
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile target
  JOIN staff_role_assignment ra ON ra.staff_profile_id=target.id AND ra.branch_id=NEW.branch_id
  WHERE target.auth_user_id=NEW.staff_auth_user_id AND target.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
 ) THEN RAISE(ABORT,'EVENT_STAFF_TARGET_NOT_ACTIVE_IN_BRANCH') END;
END;

CREATE TRIGGER event_team_assignment_authorize_insert
BEFORE INSERT ON event_team_assignment
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='events.manage' AND c.is_active=1
  WHERE actor.auth_user_id=NEW.assigned_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
 ) THEN RAISE(ABORT,'EVENT_TEAM_ASSIGNMENT_NOT_AUTHORIZED') END;
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM team t WHERE t.id=NEW.team_id AND t.branch_id=NEW.branch_id AND t.is_active=1
 ) THEN RAISE(ABORT,'EVENT_TEAM_NOT_ACTIVE_IN_BRANCH') END;
END;

CREATE TRIGGER event_registration_authorize_insert
BEFORE INSERT ON event_registration
BEGIN
 SELECT CASE WHEN NEW.created_by IS NULL OR NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.registered_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.registered_at)
   AND (
    (c.code='events.manage' AND rc.scope_mode='branch')
    OR EXISTS (SELECT 1 FROM event_staff_assignment esa
      WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
       AND esa.staff_auth_user_id=NEW.created_by AND esa.revoked_at IS NULL
       AND esa.starts_at<=NEW.registered_at AND (esa.ends_at IS NULL OR esa.ends_at>NEW.registered_at))
    OR EXISTS (SELECT 1 FROM event_team_assignment eta
      JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
      WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
       AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
       AND eta.starts_at<=NEW.registered_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.registered_at)
       AND stm.starts_at<=NEW.registered_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.registered_at))
   )
 ) THEN RAISE(ABORT,'EVENT_REGISTRATION_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER transport_reservation_authorize_insert
BEFORE INSERT ON transport_reservation
BEGIN
 SELECT CASE WHEN NEW.created_by IS NULL OR NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND (
    (c.code='events.manage' AND rc.scope_mode='branch')
    OR EXISTS (SELECT 1 FROM event_staff_assignment esa
      WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
       AND esa.staff_auth_user_id=NEW.created_by AND esa.assignment_role IN ('owner','organizer','transport')
       AND esa.revoked_at IS NULL AND esa.starts_at<=NEW.created_at
       AND (esa.ends_at IS NULL OR esa.ends_at>NEW.created_at))
    OR EXISTS (SELECT 1 FROM event_team_assignment eta
      JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
      WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id AND eta.assignment_role IN ('organizer','transport')
       AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
       AND eta.starts_at<=NEW.created_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.created_at)
       AND stm.starts_at<=NEW.created_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.created_at))
   )
 ) THEN RAISE(ABORT,'TRANSPORT_RESERVATION_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER event_closeout_authorize_insert
BEFORE INSERT ON event_closeout
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code IN ('events.manage','events.checkin') AND c.is_active=1
  WHERE actor.auth_user_id=NEW.submitted_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.submitted_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.submitted_at)
 ) THEN RAISE(ABORT,'EVENT_CLOSEOUT_SUBMIT_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER event_closeout_review_authorize_update
BEFORE UPDATE OF status ON event_closeout
WHEN OLD.status IN ('submitted','returned') AND NEW.status IN ('approved','returned')
BEGIN
 SELECT CASE WHEN NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='events.closeout.review' AND c.is_active=1
  WHERE actor.auth_user_id=NEW.reviewed_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.reviewed_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.reviewed_at)
 ) THEN RAISE(ABORT,'EVENT_CLOSEOUT_REVIEW_NOT_AUTHORIZED') END;
END;

UPDATE app_meta SET schema_version=13 WHERE id=1 AND environment='non-production';
