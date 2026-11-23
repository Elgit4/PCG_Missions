-- Restore Cloudflare-native Better Auth identities and sessions after the temporary Supabase Auth compatibility phase.
-- Existing identity IDs remain unchanged so staff_profile.auth_user_id references continue to work.
-- Credential hashes are imported separately by a secret-protected migration job.
ALTER TABLE supabase_auth_identity RENAME TO "user";

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON session(userId);
CREATE INDEX session_expires_at_idx ON session(expiresAt);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX account_user_id_idx ON account(userId);
CREATE UNIQUE INDEX account_provider_identity_idx ON account(providerId, accountId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TABLE rateLimit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL CHECK (count >= 0),
  lastRequest BIGINT NOT NULL
);
CREATE INDEX rateLimit_lastRequest_idx ON rateLimit(lastRequest);

CREATE TRIGGER staff_profile_revoke_sessions_after_deactivation
AFTER UPDATE OF account_status ON staff_profile
WHEN OLD.account_status='active' AND NEW.account_status IN ('inactive','suspended')
BEGIN
  DELETE FROM session WHERE userId=NEW.auth_user_id;
END;

CREATE TRIGGER staff_role_assignment_revoke_sessions_after_last_role
AFTER UPDATE OF revoked_at, ends_at ON staff_role_assignment
WHEN (NEW.revoked_at IS NOT NULL OR
      (NEW.ends_at IS NOT NULL AND NEW.ends_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')))
 AND NOT EXISTS (
   SELECT 1 FROM staff_role_assignment active
   JOIN role r ON r.id=active.role_id AND r.is_active=1
   JOIN branch b ON b.id=active.branch_id AND b.is_active=1
   WHERE active.staff_profile_id=NEW.staff_profile_id
     AND active.revoked_at IS NULL
     AND active.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
     AND (active.ends_at IS NULL OR active.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 )
BEGIN
  DELETE FROM session WHERE userId=(SELECT auth_user_id FROM staff_profile WHERE id=NEW.staff_profile_id);
END;

UPDATE app_meta SET schema_version=44 WHERE id=1 AND schema_version=43;
