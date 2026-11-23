-- Replace the non-production Better Auth identity/session store with a Supabase Auth identity mirror.
-- Supabase Auth remains authoritative for credentials and sessions. D1 stores only the external
-- identity key and minimal profile metadata needed to relate the identity to staff_profile.
-- Do not copy password hashes, session tokens, or verification tokens into D1.
DROP TRIGGER IF EXISTS staff_profile_revoke_sessions_after_deactivation;
DROP TRIGGER IF EXISTS staff_role_assignment_revoke_sessions_after_last_role;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS rateLimit;
ALTER TABLE "user" RENAME TO supabase_auth_identity;
ALTER TABLE supabase_auth_identity
  ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'supabase'
  CHECK (auth_provider = 'supabase');
UPDATE app_meta SET schema_version=33
WHERE id=1 AND environment='non-production';
