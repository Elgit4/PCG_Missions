-- PCG Missions D1 contacts and follow-up domain.
-- Source: reconciled live Supabase table manifest + CMI domain migration.
-- Actor columns reference the stable staff auth identity string (Better Auth user.id).
-- All timestamps are normalized UTC ISO-8601 TEXT; request digests are 32-byte BLOBs.

CREATE TABLE contact (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  first_name TEXT NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 120),
  last_name TEXT CHECK (last_name IS NULL OR length(trim(last_name)) <= 120),
  preferred_name TEXT CHECK (preferred_name IS NULL OR length(trim(preferred_name)) <= 120),
  phone_e164 TEXT CHECK (
    phone_e164 IS NULL OR (
      length(phone_e164) BETWEEN 9 AND 16
      AND substr(phone_e164, 1, 1) = '+'
      AND substr(phone_e164, 2, 1) GLOB '[1-9]'
      AND substr(phone_e164, 2) NOT GLOB '*[^0-9]*'
    )
  ),
  phone_display TEXT,
  email_normalized TEXT CHECK (
    email_normalized IS NULL OR (
      email_normalized = lower(trim(email_normalized))
      AND instr(email_normalized, '@') > 1
      AND instr(substr(email_normalized, instr(email_normalized, '@') + 1), '.') > 1
      AND instr(email_normalized, ' ') = 0
      AND instr(email_normalized, char(9)) = 0
      AND instr(email_normalized, char(10)) = 0
      AND instr(email_normalized, char(13)) = 0
      AND instr(substr(email_normalized, instr(email_normalized, '@') + 1), '@') = 0
      AND substr(email_normalized, -1, 1) <> '.'
    )
  ),
  age_range TEXT,
  preferred_language TEXT,
  contact_status TEXT NOT NULL DEFAULT 'active'
    CHECK (contact_status IN ('active', 'archived', 'merged')),
  created_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE SET NULL,
  merged_into_contact_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, branch_id),
  FOREIGN KEY (merged_into_contact_id, branch_id)
    REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  CHECK (
    (contact_status = 'merged' AND merged_into_contact_id IS NOT NULL)
    OR (contact_status <> 'merged' AND merged_into_contact_id IS NULL)
  )
);
CREATE INDEX contact_branch_name_search_idx ON contact(branch_id, first_name, last_name);
CREATE INDEX contact_phone_duplicate_review_idx ON contact(branch_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX contact_email_duplicate_review_idx ON contact(branch_id, email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX contact_status_created_idx ON contact(branch_id, contact_status, created_at DESC);

CREATE TABLE contact_capture (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  captured_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE SET NULL,
  capture_source TEXT NOT NULL CHECK (capture_source IN ('staff_manual', 'public_site', 'offline_queue', 'import')),
  service_area_id TEXT,
  client_request_id TEXT NOT NULL,
  digest_key_version INTEGER NOT NULL DEFAULT 1 CHECK (digest_key_version > 0),
  request_digest BLOB NOT NULL CHECK (length(request_digest) = 32),
  captured_at TEXT NOT NULL,
  source_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(source_metadata) AND json_type(source_metadata) = 'object'),
  created_at TEXT NOT NULL,
  UNIQUE (branch_id, client_request_id),
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (service_area_id, branch_id) REFERENCES service_area(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX contact_capture_contact_time_idx ON contact_capture(contact_id, captured_at DESC);
CREATE INDEX contact_capture_branch_time_idx ON contact_capture(branch_id, captured_at DESC);
CREATE INDEX contact_capture_actor_time_idx ON contact_capture(captured_by, captured_at DESC);
CREATE TRIGGER contact_capture_metadata_allowlist_insert
BEFORE INSERT ON contact_capture
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.source_metadata)
    WHERE key NOT IN ('app_version', 'form_version', 'device_type', 'locale')
  ) THEN RAISE(ABORT, 'CONTACT_CAPTURE_METADATA_KEY_NOT_ALLOWED') END;
END;
CREATE TRIGGER contact_capture_metadata_allowlist_update
BEFORE UPDATE OF source_metadata ON contact_capture
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.source_metadata)
    WHERE key NOT IN ('app_version', 'form_version', 'device_type', 'locale')
  ) THEN RAISE(ABORT, 'CONTACT_CAPTURE_METADATA_KEY_NOT_ALLOWED') END;
END;

CREATE TABLE contact_assignment (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  assignee_user_id TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  team_id TEXT,
  assigned_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  CHECK ((assignee_user_id IS NOT NULL) <> (team_id IS NOT NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (team_id, branch_id) REFERENCES team(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX contact_assignment_active_contact_idx ON contact_assignment(contact_id, starts_at DESC);
CREATE INDEX contact_assignment_active_user_idx ON contact_assignment(assignee_user_id, starts_at DESC) WHERE assignee_user_id IS NOT NULL;
CREATE INDEX contact_assignment_active_team_idx ON contact_assignment(team_id, starts_at DESC) WHERE team_id IS NOT NULL;

CREATE TRIGGER contact_assignment_user_no_overlap_insert
BEFORE INSERT ON contact_assignment
WHEN NEW.assignee_user_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM contact_assignment existing
    WHERE existing.contact_id = NEW.contact_id
      AND existing.assignee_user_id = NEW.assignee_user_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_USER_OVERLAP') END;
END;
CREATE TRIGGER contact_assignment_user_no_overlap_update
BEFORE UPDATE OF contact_id, assignee_user_id, starts_at, ends_at ON contact_assignment
WHEN NEW.assignee_user_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM contact_assignment existing
    WHERE existing.id <> NEW.id
      AND existing.contact_id = NEW.contact_id
      AND existing.assignee_user_id = NEW.assignee_user_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_USER_OVERLAP') END;
END;
CREATE TRIGGER contact_assignment_team_no_overlap_insert
BEFORE INSERT ON contact_assignment
WHEN NEW.team_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM contact_assignment existing
    WHERE existing.contact_id = NEW.contact_id
      AND existing.team_id = NEW.team_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_TEAM_OVERLAP') END;
END;
CREATE TRIGGER contact_assignment_team_no_overlap_update
BEFORE UPDATE OF contact_id, team_id, starts_at, ends_at ON contact_assignment
WHEN NEW.team_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM contact_assignment existing
    WHERE existing.id <> NEW.id
      AND existing.contact_id = NEW.contact_id
      AND existing.team_id = NEW.team_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_TEAM_OVERLAP') END;
END;

CREATE TABLE contact_note (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  author_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  visibility TEXT NOT NULL CHECK (visibility IN ('author_only', 'assigned_scope', 'team_scope', 'branch_scope')),
  team_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((visibility = 'team_scope' AND team_id IS NOT NULL) OR (visibility <> 'team_scope' AND team_id IS NULL)),
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (team_id, branch_id) REFERENCES team(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX contact_note_contact_time_idx ON contact_note(contact_id, created_at DESC);
CREATE INDEX contact_note_author_time_idx ON contact_note(author_user_id, created_at DESC);
CREATE INDEX contact_note_team_time_idx ON contact_note(team_id, created_at DESC) WHERE team_id IS NOT NULL;

CREATE TABLE contact_interaction (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call', 'visit', 'message', 'meeting', 'other')),
  occurred_at TEXT NOT NULL,
  outcome_code TEXT CHECK (outcome_code IS NULL OR (
    length(outcome_code) BETWEEN 2 AND 60
    AND substr(outcome_code, 1, 1) GLOB '[a-z]'
    AND outcome_code NOT GLOB '*[^a-z0-9_]*'
  )),
  summary TEXT,
  next_action_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX contact_interaction_contact_time_idx ON contact_interaction(contact_id, occurred_at DESC);
CREATE INDEX contact_interaction_actor_time_idx ON contact_interaction(actor_user_id, occurred_at DESC);

CREATE TABLE contact_merge (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  source_contact_id TEXT NOT NULL,
  surviving_contact_id TEXT NOT NULL,
  merged_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  merged_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  reversal_of TEXT UNIQUE REFERENCES contact_merge(id) ON DELETE RESTRICT,
  reversed_at TEXT,
  reversal_metadata TEXT CHECK (reversal_metadata IS NULL OR (json_valid(reversal_metadata) AND json_type(reversal_metadata) = 'object')),
  CHECK (source_contact_id <> surviving_contact_id),
  CHECK (reversal_of IS NULL OR reversal_of <> id),
  FOREIGN KEY (source_contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (surviving_contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX contact_merge_one_active_source_idx
  ON contact_merge(source_contact_id) WHERE reversal_of IS NULL AND reversed_at IS NULL;
CREATE INDEX contact_merge_survivor_time_idx ON contact_merge(surviving_contact_id, merged_at DESC);

CREATE TABLE followup_list (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  description TEXT,
  team_id TEXT,
  created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, branch_id),
  FOREIGN KEY (team_id, branch_id) REFERENCES team(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX followup_list_branch_status_idx ON followup_list(branch_id, status, created_at DESC);
CREATE INDEX followup_list_team_status_idx ON followup_list(team_id, status, created_at DESC) WHERE team_id IS NOT NULL;

CREATE TABLE followup_task (
  id TEXT PRIMARY KEY,
  list_id TEXT,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  assignee_user_id TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  team_id TEXT,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  task_note TEXT,
  created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  client_request_id TEXT,
  digest_key_version INTEGER,
  request_digest BLOB,
  FOREIGN KEY (list_id, branch_id) REFERENCES followup_list(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (team_id, branch_id) REFERENCES team(id, branch_id) ON DELETE RESTRICT,
  CHECK ((assignee_user_id IS NOT NULL) <> (team_id IS NOT NULL)),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL)),
  CHECK (
    (client_request_id IS NULL AND digest_key_version IS NULL AND request_digest IS NULL)
    OR (client_request_id IS NOT NULL AND digest_key_version IS NOT NULL AND digest_key_version > 0
        AND request_digest IS NOT NULL AND length(request_digest) = 32)
  )
);
CREATE INDEX followup_task_branch_status_due_idx ON followup_task(branch_id, status, due_at);
CREATE INDEX followup_task_contact_created_idx ON followup_task(contact_id, created_at DESC);
CREATE INDEX followup_task_assignee_status_due_idx ON followup_task(assignee_user_id, status, due_at) WHERE assignee_user_id IS NOT NULL;
CREATE INDEX followup_task_team_status_due_idx ON followup_task(team_id, status, due_at) WHERE team_id IS NOT NULL;
CREATE INDEX followup_task_list_idx ON followup_task(list_id, created_at DESC) WHERE list_id IS NOT NULL;

CREATE TABLE followup_task_event (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES followup_task(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'assigned', 'reassigned', 'status_changed', 'note_added',
    'details_updated', 'completed', 'reopened', 'cancelled'
  )),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('open', 'in_progress', 'completed', 'cancelled')),
  to_status TEXT CHECK (to_status IS NULL OR to_status IN ('open', 'in_progress', 'completed', 'cancelled')),
  details TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL
);
CREATE INDEX followup_task_event_task_time_idx ON followup_task_event(task_id, created_at DESC);
CREATE INDEX followup_task_event_actor_time_idx ON followup_task_event(actor_user_id, created_at DESC);
CREATE TRIGGER followup_task_event_no_update BEFORE UPDATE ON followup_task_event
BEGIN SELECT RAISE(ABORT, 'FOLLOWUP_TASK_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER followup_task_event_no_delete BEFORE DELETE ON followup_task_event
BEGIN SELECT RAISE(ABORT, 'FOLLOWUP_TASK_EVENT_APPEND_ONLY'); END;

CREATE TRIGGER contact_set_updated_at AFTER UPDATE ON contact
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE contact SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER contact_note_set_updated_at AFTER UPDATE ON contact_note
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE contact_note SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER followup_list_set_updated_at AFTER UPDATE ON followup_list
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE followup_list SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER followup_task_set_updated_at AFTER UPDATE ON followup_task
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE followup_task SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
