-- D1 equivalent of the private Supabase first-admin bootstrap lease.
-- Worker-only table: do not expose direct browser access and never migrate lease values.
CREATE TABLE first_admin_bootstrap_lease (
  lock_name TEXT PRIMARY KEY CHECK (lock_name='first_admin'),
  lease_id TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (lease_expires_at > acquired_at)
);
UPDATE app_meta SET schema_version=36
WHERE id=1 AND environment='non-production';
