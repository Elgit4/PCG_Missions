-- Owner-approved extension: Follow-up Volunteers may check in attendees only
-- for events to which they have an active event assignment. The Worker still
-- requires an owner/organizer/check-in assignment or ushering team membership.

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-follow-up-volunteer',id,'assigned',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM capability
WHERE code='events.checkin' AND is_active=1;

UPDATE app_meta SET schema_version=32
WHERE id=1 AND environment='non-production' AND schema_version=31;
